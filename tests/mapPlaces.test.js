import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  findCbdPeak,
  nearestPlace,
  worldToUnit,
} from "../src/mapPlaces.js";

describe("worldToUnit", () => {
  it("normalizes world coords into [0,1] within the aabb", () => {
    const aabb = {
      min: new THREE.Vector3(0, 0, 0),
      max: new THREE.Vector3(10, 20, 40),
    };
    expect(worldToUnit(0, 0, 0, aabb)).toEqual([0, 0, 0]);
    expect(worldToUnit(10, 20, 40, aabb)).toEqual([1, 1, 1]);
    expect(worldToUnit(5, 10, 20, aabb)).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("nearestPlace", () => {
  it("returns the place whose box centre is closest", () => {
    const places = [
      {
        id: "a",
        name: "A",
        unlocked: false,
        box: { min: [0, 0, 0], max: [0.2, 0.2, 0.2] },
      },
      {
        id: "b",
        name: "B",
        unlocked: false,
        box: { min: [0.8, 0.8, 0.8], max: [1, 1, 1] },
      },
    ];
    expect(nearestPlace(0.05, 0.05, 0.05, places).id).toBe("a");
    expect(nearestPlace(0.95, 0.95, 0.95, places).id).toBe("b");
  });
});

describe("findCbdPeak", () => {
  it("finds the densest elevated cell on synthetic points", () => {
    const aabb = {
      min: new THREE.Vector3(0, 0, 0),
      max: new THREE.Vector3(10, 10, 10),
    };
    // Cluster of high-Y points near unit (0.7, *, 0.3)
    const positions = [];
    for (let i = 0; i < 40; i++) {
      positions.push(7 + (i % 3) * 0.05, 8 + (i % 2) * 0.1, 3 + (i % 4) * 0.05);
    }
    // Low-Y distractors (uy < 0.28 → ignored)
    for (let i = 0; i < 20; i++) {
      positions.push(1, 1, 1);
    }
    const peak = findCbdPeak(new Float32Array(positions), aabb, 10);
    expect(peak).not.toBeNull();
    expect(peak.ux).toBeGreaterThan(0.5);
    expect(peak.uz).toBeLessThan(0.5);
    expect(peak.y).toBeGreaterThan(5);
  });

  it("returns null when nothing is elevated enough", () => {
    const aabb = {
      min: new THREE.Vector3(0, 0, 0),
      max: new THREE.Vector3(10, 10, 10),
    };
    const positions = new Float32Array([1, 1, 1, 2, 1, 2]);
    expect(findCbdPeak(positions, aabb)).toBeNull();
  });
});
