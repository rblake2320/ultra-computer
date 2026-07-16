export const stepLog: string[] = [];

export async function stepA(id: string): Promise<string> {
  stepLog.push(`stepA:${id}`);
  return `a:${id}`;
}

export async function stepB(previousResult: string): Promise<string> {
  stepLog.push(`stepB:${previousResult}`);
  return `b:${previousResult}`;
}

export async function stepC(previousResult: string): Promise<string> {
  stepLog.push(`stepC:${previousResult}`);
  return `done:${previousResult}`;
}
