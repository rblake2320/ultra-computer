import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { InferenceSession, Tensor } from "onnxruntime-node";

// A pinned, MIT-licensed upstream MatMul fixture checks the actual native CPU
// provider without network, a downloaded model, a GPU or a mock.
const model = fileURLToPath(new URL("../tests/fixtures/onnx-matmul.onnx", import.meta.url));
const session = await InferenceSession.create(model, { executionProviders: ["cpu"] });
try {
  const result = await session.run({
    a: new Tensor("float32", Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), [3, 4]),
    b: new Tensor("float32", Float32Array.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]), [4, 3]),
  });
  assert.deepEqual(result.c.dims, [3, 3]);
  assert.deepEqual(Array.from(result.c.data), [700, 800, 900, 1580, 1840, 2100, 2460, 2880, 3300]);
  console.log("Worked: native ONNX CPU inference returned all nine expected values.");
} finally {
  await session.release();
}
