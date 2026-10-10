import { config } from '../config.js';

let clientPromise;

async function getClient() {
  clientPromise ||= (async () => {
    const sdk = await import('@aws-sdk/client-bedrock-runtime');
    return { sdk, client: new sdk.BedrockRuntimeClient({ region: config.bedrockRegion }) };
  })();
  return clientPromise;
}

/**
 * Amazon Bedrock through the Converse API, which works the same for most models.
 * Credentials come from the normal AWS chain (environment, shared profile or instance role).
 */
export async function explainWithBedrock({ system, user, timeoutMs }) {
  if (!config.bedrockModelId) throw new Error('BEDROCK_MODEL_ID is not set');
  const { sdk, client } = await getClient();
  const response = await client.send(
    new sdk.ConverseCommand({
      modelId: config.bedrockModelId,
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: user }] }],
      inferenceConfig: { maxTokens: 500, temperature: 0.2 },
    }),
    { abortSignal: AbortSignal.timeout(timeoutMs || config.llmTimeoutMs) },
  );
  return (response.output?.message?.content || []).map((part) => part.text || '').join('');
}
