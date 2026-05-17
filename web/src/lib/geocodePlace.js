/** Estrae città/CAP leggibile da risultato Google Geocoder */
export function localityFromGeocodeResult(result) {
  if (!result) return "";
  const comps = result.address_components || [];
  const pick = (...types) => {
    const c = comps.find((ac) => types.some((t) => ac.types?.includes(t)));
    return c?.long_name || "";
  };

  const city =
    pick("locality", "postal_town", "administrative_area_level_3") ||
    pick("sublocality", "administrative_area_level_2");
  const cap = pick("postal_code");

  if (city && cap) return `${city}, ${cap}`;
  if (city) return city;
  if (cap) return cap;

  const formatted = result.formatted_address || "";
  const parts = formatted.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(", ");
  return formatted;
}
