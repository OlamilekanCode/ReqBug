const HEX_PATTERN = /^[0-9a-f]+$/i;

export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
    ).join("")
}

export function hexToBytes(hex: string): Uint8Array | null {
    if (
        hex.length === 0 ||
        hex.length % 2 !== 0 ||
        !HEX_PATTERN.test(hex)
    ) {
        return null;
    }

    const bytes = new Uint8Array(hex.length / 2)

    for(let index = 0; index < hex.length; index += 2) {
        bytes[index / 2] = Number.parseInt(
            hex.slice(index, index + 2),
            16,
        )
    }
    return bytes
}