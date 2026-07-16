import type {
  ModelRequest,
  ModelResponse,
  NormalizedProviderError,
  ProviderModelDescriptor,
} from "./types.js";
import type { NormalizedModelEvent } from "./events.js";

export interface ProviderAdapterFeatures {
  discovery: boolean;
  streaming: boolean;
}

export interface ProviderRequestContext {
  requestId: string;
  signal?: AbortSignal;
}

export interface ListModelsOptions {
  signal?: AbortSignal;
  cursor?: string;
}

export interface ListModelsResult {
  models: readonly ProviderModelDescriptor[];
  nextCursor?: string;
}

/**
 * Stable boundary implemented by provider-specific integrations.
 *
 * `generate` is required because every chat-capable adapter must provide a
 * complete response. Discovery and streaming remain optional and are declared
 * through `features`, allowing local and legacy providers to participate
 * without pretending to support operations they do not expose.
 */
export interface ProviderAdapter {
  readonly provider: string;
  readonly features: Readonly<ProviderAdapterFeatures>;

  generate(request: ModelRequest, context: ProviderRequestContext): Promise<ModelResponse>;
  stream?(
    request: ModelRequest,
    context: ProviderRequestContext,
  ): AsyncIterable<NormalizedModelEvent>;
  listModels?(options?: ListModelsOptions): Promise<ListModelsResult>;
}

export class ProviderAdapterError extends Error {
  readonly details: NormalizedProviderError;

  constructor(details: NormalizedProviderError, options?: ErrorOptions) {
    super(details.message, options);
    this.name = "ProviderAdapterError";
    this.details = details;
  }
}
