/**
 * Background analysis: analyseDesign and levitationEnvelope take 5 to 25 ms,
 * so they run here to keep slider drags smooth on the main thread.
 */
import { analyseDesign, levitationEnvelope } from "../model";
import type { AnalysisRequest, AnalysisResponse } from "./analysisClient";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AnalysisRequest>) => void) | null;
  postMessage: (message: AnalysisResponse) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  try {
    if (request.type === "analyse") {
      scope.postMessage({ id: request.id, type: "analyse", analysis: analyseDesign(request.design) });
    } else {
      scope.postMessage({
        id: request.id,
        type: "envelope",
        envelope: levitationEnvelope(request.design, request.speeds, request.sizes),
      });
    }
  } catch (error) {
    scope.postMessage({ id: request.id, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
