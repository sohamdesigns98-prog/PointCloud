import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  LAYER,
  classifyLayers,
  sampleMeshSurface,
} from "../src/sampleMesh.js";

describe("sampleMeshSurface", () => {
  it("returns the requested count of points inside the mesh bbox", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    const count = 500;
    const sample = sampleMeshSurface(mesh, count);

    expect(sample.positions.length / 3).toBe(count);
    expect(sample.layers).toHaveLength(count);

    const box = new THREE.Box3().setFromObject(mesh);
    // Allow a tiny epsilon for float sampling on surface
    const pad = 1e-4;
    for (let i = 0; i < count; i++) {
      const x = sample.positions[i * 3];
      const y = sample.positions[i * 3 + 1];
      const z = sample.positions[i * 3 + 2];
      expect(x).toBeGreaterThanOrEqual(box.min.x - pad);
      expect(x).toBeLessThanOrEqual(box.max.x + pad);
      expect(y).toBeGreaterThanOrEqual(box.min.y - pad);
      expect(y).toBeLessThanOrEqual(box.max.y + pad);
      expect(z).toBeGreaterThanOrEqual(box.min.z - pad);
      expect(z).toBeLessThanOrEqual(box.max.z + pad);
    }
  });
});

describe("classifyLayers", () => {
  it("returns only LAYER values 0–2", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1));
    const sample = sampleMeshSurface(mesh, 200);
    const { layers } = classifyLayers(sample.positions, sample.normals);
    expect(layers).toHaveLength(200);
    const allowed = new Set([LAYER.GROUND, LAYER.PODIUM, LAYER.SAILS]);
    for (let i = 0; i < layers.length; i++) {
      expect(allowed.has(layers[i])).toBe(true);
    }
  });
});
