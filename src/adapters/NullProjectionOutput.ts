import type {
  ProjectionOutputAdapter,
  RuntimeSnapshot,
} from "../core/contracts";

export class NullProjectionOutput implements ProjectionOutputAdapter {
  readonly label = "Digital twin only";
  readonly available = false;

  publish(_snapshot: RuntimeSnapshot): void {
    // Intentionally empty. Physical projection requires a measured adapter.
  }
}
