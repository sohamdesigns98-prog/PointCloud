import { autoTitleFromBody, LEAVE_PROMPT, MAX_BODY_CHARS } from "../memories.js";
import { appendUserMemory } from "../memoryStore.js";
import { getPass } from "../pass/passStore.js";
import { createVoiceCapture } from "../voiceCapture.js";

/**
 * Single leave screen: write + tap to confirm.
 */
export function createLeaveMemory({
  mount,
  garden,
  onEnter,
  onExit,
  onCountChange,
  onComplete,
}) {
  const root = document.createElement("div");
  root.id = "leave-mode";
  root.className = "leave-mode";
  root.hidden = true;
  mount.appendChild(root);

  let active = false;
  let recording = false;
  let voice = null;
  let casting = false;

  function open() {
    if (active) return;
    active = true;
    casting = false;
    const pass = getPass();

    root.hidden = false;
    root.innerHTML = `
      <section class="leave-screen leave-screen--compose">
        <button type="button" class="leave-top-close" data-close>Close</button>
        <div class="leave-screen-inner">
          <p class="leave-kicker">Leave a memory</p>
          <h1 class="leave-hero">${escapeHtml(LEAVE_PROMPT)}</h1>
          <p class="leave-place">Sydney Opera House</p>
          <div class="leave-type-wrap" data-type-wrap>
            <textarea data-type rows="5" maxlength="${MAX_BODY_CHARS}"
              placeholder="A few ordinary words are enough."></textarea>
            <p class="leave-type-count" data-count>0/${MAX_BODY_CHARS}</p>
          </div>
          <button type="button" class="pill pill--ghost" data-record>Record instead</button>
          <p class="leave-status" data-status>Or leave a quiet voice note — optional.</p>
          <p class="leave-transcript" data-transcript></p>
          <button type="button" class="pill pill--primary" data-confirm disabled>
            Tap to confirm
          </button>
        </div>
      </section>
    `;
    requestAnimationFrame(() => root.classList.add("is-active"));
    onEnter?.();
    wire(pass);
  }

  function wire(pass) {
    const recordBtn = root.querySelector("[data-record]");
    const status = root.querySelector("[data-status]");
    const transcript = root.querySelector("[data-transcript]");
    const typeInput = root.querySelector("[data-type]");
    const count = root.querySelector("[data-count]");
    const confirmBtn = root.querySelector("[data-confirm]");
    let body = "";
    let audioDataUrl = null;

    function refresh() {
      const ok = body.trim().length > 0 || Boolean(audioDataUrl) || typeInput.value.trim().length > 0;
      if (confirmBtn) confirmBtn.disabled = !ok || casting;
      if (count) count.textContent = `${typeInput.value.length}/${MAX_BODY_CHARS}`;
    }

    root.querySelector("[data-close]")?.addEventListener("click", () => close({ cancel: true }));

    typeInput?.addEventListener("input", () => {
      if (typeInput.value.length > MAX_BODY_CHARS) {
        typeInput.value = typeInput.value.slice(0, MAX_BODY_CHARS);
      }
      body = typeInput.value;
      refresh();
    });

    requestAnimationFrame(() => typeInput?.focus());

    recordBtn?.addEventListener("click", async () => {
      if (recording) {
        recordBtn.disabled = true;
        status.textContent = "Keeping what you said…";
        const result = await voice.stop();
        recording = false;
        recordBtn.disabled = false;
        recordBtn.textContent = "Record again";
        recordBtn.classList.remove("is-recording");
        audioDataUrl = result.dataUrl;
        const spoken = (result.transcript || "").trim();
        if (spoken) {
          body = spoken.slice(0, MAX_BODY_CHARS);
          transcript.textContent = body;
          typeInput.value = body;
        } else if (!body) {
          transcript.textContent =
            "No transcript — that’s fine. Type a few words, or leave it as it is.";
        }
        status.textContent = result.dataUrl
          ? "Recording kept — you can still edit the text above."
          : "Couldn’t keep audio — type a few words instead.";
        refresh();
        typeInput?.focus();
        return;
      }
      try {
        voice = createVoiceCapture({
          onTranscript(text) {
            transcript.textContent = text.slice(0, MAX_BODY_CHARS);
          },
        });
        await voice.start();
        recording = true;
        recordBtn.textContent = "Stop";
        recordBtn.classList.add("is-recording");
        status.textContent = "Listening… tap Stop when you’re done.";
        transcript.textContent = "";
      } catch {
        status.textContent = "Microphone unavailable — keep typing instead.";
        typeInput?.focus();
      }
    });

    confirmBtn?.addEventListener("click", async () => {
      if (casting) return;
      if (typeInput.value.trim()) body = typeInput.value.trim().slice(0, MAX_BODY_CHARS);
      if (!body.trim() && audioDataUrl) body = "A moment I left here.";
      if (!body.trim()) return;

      casting = true;
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Leaving…";
      if (recording) voice?.cancel();

      const id = `u${Date.now().toString(36)}`;
      const memory = {
        id,
        title: autoTitleFromBody(body),
        body: body.trim().slice(0, MAX_BODY_CHARS),
        relationship: "firstTime",
        region: garden?.suggestRegion?.() || "forecourt",
        place: "Opera House",
        emotion: "Nostalgia",
        authorName: pass?.name || "",
      };
      if (audioDataUrl) memory.audioDataUrl = audioDataUrl;

      try {
        const { ok, audioDropped } = appendUserMemory(memory);
        if (!ok) {
          if (status) {
            status.textContent =
              "Couldn't save on this device — your words are still here. Try again.";
          }
          return;
        }
        if (audioDropped) {
          delete memory.audioDataUrl;
          if (status) {
            status.textContent =
              "Saved without the recording (storage is full).";
          }
        }
        try {
          await garden?.addMemory?.(memory);
        } catch (err) {
          console.error(err);
        }
        onCountChange?.();
        close({ cancel: false, castId: id });
      } finally {
        if (active) {
          casting = false;
          if (confirmBtn.isConnected) {
            confirmBtn.textContent = "Tap to confirm";
            refresh();
          }
        }
      }
    });

    refresh();
  }

  function close({ cancel = true, castId = null } = {}) {
    if (!active) return;
    if (recording) voice?.cancel();
    recording = false;
    voice = null;
    active = false;
    casting = false;
    root.classList.remove("is-active");
    root.hidden = true;
    root.innerHTML = "";
    onExit?.();
    if (!cancel && castId) onComplete?.(castId);
  }

  return {
    open,
    close: () => close({ cancel: true }),
    isActive: () => active,
    destroy() {
      close({ cancel: true });
      root.remove();
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
