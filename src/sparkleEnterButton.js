/**
 * GSAP sparkle hover for the opener Enter button.
 * Adapted from Aaron Iker — https://codepen.io/aaroniker/pen/gOdBBKq (MIT)
 * Particle colour matches garden Opera House sails (#ffd89a).
 */
import gsap from "gsap";

const DOT_AMOUNT = 36;
const GOLD = "#ffd89a";
const GOLD_SOFT = "#ffe4b0";

function createSVG(width, height, className, childType, childAttributes) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add(className);

  const child = document.createElementNS(
    "http://www.w3.org/2000/svg",
    childType
  );

  svg.setAttributeNS(
    "http://www.w3.org/2000/svg",
    "viewBox",
    `0 0 ${width} ${height}`
  );

  for (const attr in childAttributes) {
    child.setAttribute(attr, childAttributes[attr]);
  }

  svg.appendChild(child);
  return { svg, child };
}

/**
 * @param {HTMLButtonElement} button
 * @returns {{ destroy: () => void }}
 */
export function mountSparkleEnterButton(button) {
  if (!button) return { destroy() {} };

  const width = Math.max(1, button.offsetWidth);
  const height = Math.max(1, button.offsetHeight);
  const style = getComputedStyle(button);
  const radius = parseInt(style.borderRadius, 10) || height / 2;

  const { svg, child: circle } = createSVG(width, height, "dots", "circle", {
    cx: "0",
    cy: "0",
    r: "0",
    fill: GOLD_SOFT,
  });

  const strokeGroup = document.createElement("div");
  strokeGroup.classList.add("stroke");

  const { svg: stroke } = createSVG(width, height, "stroke-line", "rect", {
    x: "0",
    y: "0",
    width: "100%",
    height: "100%",
    rx: String(radius),
    ry: String(radius),
    pathLength: "10",
  });

  button.appendChild(svg);
  strokeGroup.appendChild(stroke);
  strokeGroup.appendChild(stroke.cloneNode(true));
  button.appendChild(strokeGroup);

  const timeline = gsap.timeline({ paused: true });

  for (let i = 0; i < DOT_AMOUNT; i++) {
    const p = circle.cloneNode(true);
    const bright = Math.random() > 0.45;
    p.setAttribute("fill", bright ? GOLD_SOFT : GOLD);
    p.setAttribute("stroke", GOLD);
    p.setAttribute("stroke-width", "0.4");
    svg.appendChild(p);

    const cx = gsap.utils.random(width * 0.1, width * 0.9);
    const cy = gsap.utils.random(height * 0.2, height * 0.8);
    // Smaller, sharper particles
    const peakR = gsap.utils.random(1.05, 1.85);
    const rise = gsap.utils.random(height * 0.55, height * 1.15);
    const drift = gsap.utils.random(-width * 0.12, width * 0.12);
    const dur = gsap.utils.random(1.35, 2.05);

    gsap.set(p, {
      attr: { cx, cy, r: 0 },
      opacity: 1,
    });

    const tl = gsap.timeline();
    tl.to(p, {
      duration: dur * 0.14,
      attr: { r: peakR },
      ease: "power2.out",
    })
      .to(
        p,
        {
          duration: dur,
          attr: {
            cy: cy - rise,
            cx: cx + drift,
          },
          ease: "power1.out",
        },
        0
      )
      .to(
        p,
        {
          duration: dur * 0.28,
          attr: { r: 0.15 },
          opacity: 0,
          ease: "power2.in",
        },
        dur * 0.62
      );

    timeline.add(tl, i * 0.09);
  }

  svg.removeChild(circle);

  timeline.pause();

  function onEnter() {
    gsap.to(button, {
      "--sparkle-dots-opacity": "1",
      duration: 0.12,
    });
    timeline.repeat(-1).restart(true);
  }

  function onLeave() {
    gsap.to(button, {
      "--sparkle-dots-opacity": "0",
      duration: 0.18,
      onComplete: () => {
        timeline.pause(0);
      },
    });
  }

  button.addEventListener("pointerenter", onEnter);
  button.addEventListener("pointerleave", onLeave);

  return {
    destroy() {
      button.removeEventListener("pointerenter", onEnter);
      button.removeEventListener("pointerleave", onLeave);
      timeline.kill();
      svg.remove();
      strokeGroup.remove();
    },
  };
}
