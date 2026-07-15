use tiny_keccak::{Hasher, Keccak};
use wasm_bindgen::prelude::*;

/// Search `count` consecutive nonces starting from `start_nonce` for a value
/// `n` such that `keccak256(challenge || abi.encode(uint256(n))) < target`.
///
/// This mirrors the Daemon contract's check:
///   `keccak256(abi.encode(_challenge(msg.sender), nonce)) < currentDifficulty`
///
/// `challenge` must be the 32-byte output of `pick.getChallenge(miner)`.
/// `target` must be `currentDifficulty` encoded as 32 bytes, big-endian.
///
/// Returns the winning nonce as a u64, or `None` if the range was exhausted.
#[wasm_bindgen]
pub fn try_nonces(
    challenge: &[u8],
    target: &[u8],
    start_nonce: u64,
    count: u64,
) -> Option<u64> {
    if challenge.len() != 32 || target.len() != 32 {
        return None;
    }

    // Pre-fill the 64-byte preimage. The first 32 bytes (the challenge)
    // are constant within an epoch; only the last 8 bytes (nonce as
    // uint256 big-endian, upper 192 bits zero) change per iteration.
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(challenge);

    let mut tgt = [0u8; 32];
    tgt.copy_from_slice(target);

    let mut nonce = start_nonce;
    for _ in 0..count {
        // abi.encode(uint256(nonce)) = 24 zero bytes + 8 nonce bytes (BE)
        preimage[56..64].copy_from_slice(&nonce.to_be_bytes());

        let mut hasher = Keccak::v256();
        hasher.update(&preimage);
        let mut out = [0u8; 32];
        hasher.finalize(&mut out);

        if lt_be(&out, &tgt) {
            return Some(nonce);
        }
        nonce = nonce.wrapping_add(1);
    }
    None
}

#[inline(always)]
fn lt_be(a: &[u8; 32], b: &[u8; 32]) -> bool {
    for i in 0..32 {
        if a[i] != b[i] {
            return a[i] < b[i];
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keccak(input: &[u8]) -> [u8; 32] {
        let mut h = Keccak::v256();
        h.update(input);
        let mut out = [0u8; 32];
        h.finalize(&mut out);
        out
    }

    #[test]
    fn finds_nonce_with_loose_target() {
        // target = type(uint256).max: every hash qualifies, so nonce 0 wins.
        let challenge = [0u8; 32];
        let mut target = [0u8; 32];
        for byte in &mut target { *byte = 0xff; }
        assert_eq!(try_nonces(&challenge, &target, 0, 1), Some(0));
    }

    #[test]
    fn returns_none_when_range_exhausted() {
        // target = 0: no hash qualifies.
        let challenge = [1u8; 32];
        let target = [0u8; 32];
        assert_eq!(try_nonces(&challenge, &target, 0, 100), None);
    }

    #[test]
    fn matches_solidity_layout() {
        // Spot-check the abi.encode(bytes32, uint256) layout. Compute manually
        // and compare against try_nonces with target = the resulting hash + 1.
        let challenge = [0xab; 32];
        let nonce: u64 = 1234567;
        let mut preimage = [0u8; 64];
        preimage[..32].copy_from_slice(&challenge);
        preimage[56..64].copy_from_slice(&nonce.to_be_bytes());
        let h = keccak(&preimage);

        // Target = h + 1 (so h qualifies as < target).
        let mut target = h;
        for i in (0..32).rev() {
            if target[i] == 0xff { target[i] = 0; continue; }
            target[i] += 1;
            break;
        }
        assert_eq!(try_nonces(&challenge, &target, nonce, 1), Some(nonce));
    }
}
