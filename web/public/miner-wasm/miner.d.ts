/* tslint:disable */
/* eslint-disable */

/**
 * Search `count` consecutive nonces starting from `start_nonce` for a value
 * `n` such that `keccak256(challenge || abi.encode(uint256(n))) < target`.
 *
 * This mirrors the Nonce contract's check:
 *   `keccak256(abi.encode(_challenge(msg.sender), nonce)) < currentDifficulty`
 *
 * `challenge` must be the 32-byte output of `pick.getChallenge(miner)`.
 * `target` must be `currentDifficulty` encoded as 32 bytes, big-endian.
 *
 * Returns the winning nonce as a u64, or `None` if the range was exhausted.
 */
export function try_nonces(challenge: Uint8Array, target: Uint8Array, start_nonce: bigint, count: bigint): bigint | undefined;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly try_nonces: (a: number, b: number, c: number, d: number, e: bigint, f: bigint) => [number, bigint];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
