# ERC-7730 compiled definition protocol

Status: alpha format 1. All multi-byte integers are unsigned big endian unless
the field says otherwise. Decoders reject unknown required flags, non-minimal
integers, duplicate sections, out-of-order sections and trailing bytes.

## Trust boundary

The host compiles ERC-7730 v2 JSON. Firmware never trusts a host decode: the
compiled program contains types, paths and display operations, while every
displayed transaction value is read from the exact calldata or canonical
EIP-712 value stream that the device signs.

The signed envelope is purpose-separated from every older ClearSign format.
Its signature preimage begins with the 24-byte ASCII domain
`KEEPKEY:ERC7730:CATALOG\0`. A certified failure aborts signing; it never falls
back to a less specific certified display. Runtime/self-service metadata stays
additive and cannot suppress raw review.

## Envelope

| Field | Size | Meaning |
|---|---:|---|
| magic | 4 | `K773` |
| envelope version | 1 | `1` |
| purpose | 1 | `1` (ERC-7730 catalog) |
| definition length | 4 | bounded canonical program length |
| definition | variable | format below |
| proof count | 1 | number of 32-byte Merkle siblings |
| proof | 32 × count | sorted-pair SHA-256 inclusion proof |
| certificate length | 2 | root-certified delegate certificate length |
| certificate | variable | KeepKey delegation certificate |
| signature | 64 | compact secp256k1 signature over the domain and leaf |
| recovery | 1 | recovery identifier |

The leaf is `SHA256(0x00 || definition)`. An internal node is
`SHA256(0x01 || min(left,right) || max(left,right))`. The certified catalog
root and delegate certificate bind provider identity, issuance epoch,
revocation epoch and the ERC-7730-only purpose.

## Canonical program header

| Field | Size |
|---|---:|
| magic | 4 (`C773`) |
| compiler format version | 1 (`1`) |
| ERC-7730 schema major/minor | 1 + 1 |
| definition kind | 1 |
| flags | 2 |
| chain id | 8 |
| contract/domain address | 20 |
| selector or primary type hash | 32 |
| source JSON SHA-256 | 32 |
| compiler identity SHA-256 | 32 |
| token/network set SHA-256 | 32 |
| provider id | 4 |
| issuance epoch | 4 |
| revocation epoch | 4 |
| section count | 1 |

Calldata definitions use the first four bytes of `selector or primary type
hash` and require its remaining bytes to be zero. EIP-712 definitions use the
complete primary type hash and bind a canonical domain-constraint section.
Address zero means that the deployment section supplies all allowed targets;
otherwise it is the single allowed target.

Each section is `type:u8 || length:u32 || payload`. Section types are strictly
ascending. Format 1 defines:

1. string table
2. ABI node table
3. path table
4. literal table
5. condition table
6. formatter table
7. display instruction table
8. deployment/domain constraints
9. resource declaration

Indices are zero-based unsigned 16-bit integers. `0xffff` is the absent index.
Strings are UTF-8, length-prefixed by a minimal `u16`, contain no NUL, and are
stored in first-use order with duplicates interned. Byte literals use a `u32`
length. Tables use a `u16` entry count followed by entries.

## Flat ABI node table

Nodes are forward-only, so cycles are structurally impossible. A node is:

`kind:u8 || size:u16 || first_child:u16 || child_count:u16 || array_length:u16`

Kinds are uint, int, address, bool, fixed bytes, bytes, string, tuple and array
(values 1 through 9). Integer size is its legal Solidity bit width. Fixed bytes
size is 1–32. Tuple children are contiguous. An array has exactly one child;
array length `0xffff` means dynamic. The root is node zero and is a tuple for
calldata. EIP-712 definitions use the same flat table for their validated value
tree.

Firmware requires canonical ABI: clean integer/address/bool/fixed-bytes
padding, valid UTF-8 strings, aligned in-bounds offsets, packed tails in member
order, no gaps/aliases/overlaps, and complete input coverage.

## Paths and display program

The compiler resolves every JSON `#`, `$` and `@` reference. A path entry
contains a source (`calldata`, `typed-data`, `container`, or `literal`), up to
16 signed 32-bit field/array indices, and an optional half-open slice. Negative
array indices are retained and resolved against the device-decoded length.
Full-array selection is an explicit flag, never an omitted index. Container
values are restricted to device-owned `from`, `to`, `value`, `chainId`, domain
and primary-type facts.

Conditions are typed operations `always`, `never`, `empty`, `not-empty`, `in`
and `not-in` over paths and literal sets. Formatters cover raw values, native
and token amounts, NFT name, date, duration, unit, enum, chain id, address,
token ticker, ERC-7930 interoperable address, embedded calldata and encrypted
field fallback. Formatter operands are typed path/literal indices; a live
result has no opcode capable of replacing a decoded operand.

Display instructions are a bounded linear program: intent text/interpolation,
field, group begin/end, array begin/end, separator and embedded call. Forward
jumps are allowed only for false conditions and loop ends. There are no
backward jumps except the bounded array iterator. Embedded calls carry a
definition lookup key and decrement the signed recursion budget.

## Fixed firmware limits (format 1)

- 64 ABI nodes and 8 levels of ABI nesting
- 64 aggregate decoded array elements
- 16 path components
- 64 paths, 64 fields and 32 conditions
- 96 interned strings, each at most 128 bytes
- 16 KiB canonical program and 1 KiB transport chunks
- 4 embedded-call levels and no repeated definition id in one call chain

The resource section repeats the compiler's exact counts. Firmware recomputes
them while parsing and rejects disagreement or exhaustion.
