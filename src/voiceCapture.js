/**
 * Voice-first capture for leave-a-memory.
 * Audio is the memory; transcript is optional and unpolished.
 */

export function createVoiceCapture({ onTranscript } = {}) {
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let recognition = null;
  let transcript = "";
  let startedAt = 0;

  const SpeechRecognition =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  async function start() {
    transcript = "";
    chunks = [];
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = pickMimeType();
    mediaRecorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };

    startedAt = performance.now();
    mediaRecorder.start(200);
    startRecognition();
  }

  function startRecognition() {
    if (!SpeechRecognition) return;
    try {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-AU";
      recognition.onresult = (event) => {
        let text = "";
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        transcript = text.trim();
        onTranscript?.(transcript);
      };
      recognition.onerror = () => {
        /* keep recording; transcript optional */
      };
      recognition.start();
    } catch {
      recognition = null;
    }
  }

  function stopRecognition() {
    if (!recognition) return;
    try {
      recognition.onresult = null;
      recognition.stop();
    } catch {
      /* ignore */
    }
    recognition = null;
  }

  function stop() {
    return new Promise((resolve) => {
      stopRecognition();
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        cleanupStream();
        resolve({
          blob: null,
          dataUrl: null,
          transcript,
          durationMs: performance.now() - startedAt,
        });
        return;
      }
      mediaRecorder.onstop = async () => {
        const type = mediaRecorder.mimeType || "audio/webm";
        const blob = chunks.length ? new Blob(chunks, { type }) : null;
        cleanupStream();
        mediaRecorder = null;
        const dataUrl = blob ? await blobToDataUrl(blob) : null;
        resolve({
          blob,
          dataUrl,
          transcript,
          durationMs: performance.now() - startedAt,
        });
      };
      mediaRecorder.stop();
    });
  }

  function cancel() {
    stopRecognition();
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    mediaRecorder = null;
    chunks = [];
    cleanupStream();
  }

  function cleanupStream() {
    stream?.getTracks?.().forEach((t) => t.stop());
    stream = null;
  }

  function getTranscript() {
    return transcript;
  }

  function isRecording() {
    return mediaRecorder?.state === "recording";
  }

  return { start, stop, cancel, getTranscript, isRecording };
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
