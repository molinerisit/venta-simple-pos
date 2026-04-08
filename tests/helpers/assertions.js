'use strict';

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}\n  Expected: ${JSON.stringify(expected)}\n  Got:      ${JSON.stringify(actual)}`
    );
  }
}

function assertNotEqual(actual, unexpected, message) {
  if (actual === unexpected) {
    throw new Error(
      `${message}\n  Expected NOT: ${JSON.stringify(unexpected)}\n  Got:          ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(`${message}\n  Expected truthy, got: ${JSON.stringify(value)}`);
  }
}

function assertFalse(value, message) {
  if (value) {
    throw new Error(`${message}\n  Expected falsy, got: ${JSON.stringify(value)}`);
  }
}

/** Asserts actual >= min */
function assertGte(actual, min, message) {
  if (actual < min) {
    throw new Error(`${message}\n  Expected >= ${min}, got: ${actual}`);
  }
}

/** Asserts |actual - expected| <= tolerance */
function assertApprox(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${message}\n  Expected ~${expected} (±${tolerance}), got: ${actual}`
    );
  }
}

module.exports = { assertEqual, assertNotEqual, assertTrue, assertFalse, assertGte, assertApprox };
