export const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;
