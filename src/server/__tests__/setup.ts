import { beforeEach } from "vitest";
import { clearRateLimits } from "../rate-limit";

beforeEach(() => {
  clearRateLimits();
});
