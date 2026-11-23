// GSM 03.38 basic character set and extension table. Characters in the extension table use two septets.
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENSION = "^{}\\[~]|€";

const BASIC_SET = new Set([...GSM_BASIC]);
const EXT_SET = new Set([...GSM_EXTENSION]);

export interface SmsAnalysis {
  encoding: "gsm7" | "ucs2";
  units: number;
  segments: number;
  singleLimit: number;
  multiLimit: number;
}

/**
 * Estimates encoding and segment count the way Nishchit bills them: GSM-7 holds 160 units per
 * single segment and 153 per concatenated segment; UCS-2 holds 70 and 67. The server's
 * /v1/pricing/preview and the send response remain authoritative.
 */
export function analyzeSms(body: string): SmsAnalysis {
  let gsm = true;
  let units = 0;
  for (const ch of body) {
    if (BASIC_SET.has(ch)) units += 1;
    else if (EXT_SET.has(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) return build("gsm7", units, 160, 153);

  let ucsUnits = 0;
  for (const ch of body) ucsUnits += (ch.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
  return build("ucs2", ucsUnits, 70, 67);
}

function build(encoding: "gsm7" | "ucs2", units: number, singleLimit: number, multiLimit: number): SmsAnalysis {
  const segments = units === 0 ? 0 : units <= singleLimit ? 1 : Math.ceil(units / multiLimit);
  return { encoding, units, segments, singleLimit, multiLimit };
}
