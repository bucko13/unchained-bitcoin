/**
 * This modulde provides functions for validating and handling
 * multisig transaction signatures.
 * 
 * @module signatures
 */

import BigNumber from 'bignumber.js';
import bip66 from "bip66";

import {P2SH} from "./p2sh";
import {P2SH_P2WSH} from "./p2sh_p2wsh";
import {P2WSH} from "./p2wsh";
import {
  multisigAddressType,
  multisigRedeemScript,
  multisigWitnessScript,
  multisigPublicKeys,
  multisigTotalSigners,
} from "./multisig";

const bitcoin = require('bitcoinjs-lib');

/**
 * Validate a multisig signature for given input and public key.
 * 
 * @param {Transaction} unsignedTransaction - transaction to validate
 * @param {number} inputIndex - the index where the input appears in the transaction
 * @param {module:transactions.UTXO} input - the input itself
 * @param {string} signerInputSignature - signature to validate
 * @returns {string|boolean} false if invalid or corresponding public key
 * @example
 * import {
 *   generateMultisigFromPublicKeys, TESTNET, P2SH,
 *   unsignedMultisigTransaction,
 *   validateMultisigSignature,
 * } from "unchained-bitcoin";
 * const pubkey1 = "03a...";
 * const pubkey2 = "03b...";
 * const multisig = generateMultisigFromPublicKeys(TESTNET, P2SH, 2, pubkey1, pubkey2);
 * const inputs = [
 *   {
 *     txid: "ae...",
 *     index: 0,
 *     multisig,
 *   },
 *   // other inputs...
 * ];
 * const outputs = [
 *   {
 *     address: "2N...",
 *     amountSats: 90000,
 *   },
 *   // other outputs...
 * ];
 * const unsignedTransaction = unsignedMultisigTransaction(TESTNET, inputs, outputs);
 * const signature = "304...";
 * const result = validateMultisigSignature(unsignedTransaction, 0, inputs[0], signature);
 * switch (result) {
 *   case false:
 *     // signature was invalid
 *   case pubkey1:
 *     // signature was valid for pubkey1
 *   case pubkey2:
 *     // signature was valid for pubkey2
 *   default:
 *     // ...
 * }
 */
export function validateMultisigSignature(unsignedTransaction, inputIndex, input, signerInputSignature) {
  const hash = multisigSignatureHash(unsignedTransaction, inputIndex, input);
  const signatureBuffer = multisigSignatureBuffer(signatureNoSighashType(signerInputSignature));
  const publicKeys = multisigPublicKeys(input.multisig);
  for (var publicKeyIndex=0; publicKeyIndex < multisigTotalSigners(input.multisig); publicKeyIndex++) {
    const publicKey = publicKeys[publicKeyIndex];
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    const keyPair = bitcoin.ECPair.fromPublicKey(publicKeyBuffer);
    if (keyPair.verify(hash, signatureBuffer)) {
      return publicKey;
    }
  }
  return false;
}

export function signatureNoSighashType(signature) {
  const len = parseInt(signature.slice(2,4), 16);
  if (len == (signature.length - 4) / 2) return signature;
  else return signature.slice(0, -2);
}

function multisigSignatureHash(unsignedTransaction, inputIndex, input) {
  if (multisigAddressType(input.multisig) === P2WSH || multisigAddressType(input.multisig) === P2SH_P2WSH) {
    return unsignedTransaction.hashForWitnessV0(inputIndex, multisigWitnessScript(input.multisig).output, BigNumber(input.amountSats).toNumber(), bitcoin.Transaction.SIGHASH_ALL);
  } else {
    return unsignedTransaction.hashForSignature(inputIndex, multisigRedeemScript(input.multisig).output, bitcoin.Transaction.SIGHASH_ALL);
  }
}

function multisigSignatureBuffer(signature) {
  const encodedSignerInputSignatureBuffer = new Buffer(signature, 'hex');
  const decodedSignerInputSignatureBuffer = bip66.decode(encodedSignerInputSignatureBuffer);
  const {r, s} = decodedSignerInputSignatureBuffer;
  // Ignore the leading 0 if r is 33 bytes
  let rToUse = r;
  if (r.byteLength > 32) {
    rToUse = r.slice(1);
  }

  const signatureBuffer = new Buffer(64);
  signatureBuffer.set(new Buffer(rToUse), 0);
  signatureBuffer.set(new Buffer(s), 32);
  return signatureBuffer;
}
