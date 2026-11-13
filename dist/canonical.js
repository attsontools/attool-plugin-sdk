function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (!isRecord(value))
        return value;
    return Object.fromEntries(Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]));
}
