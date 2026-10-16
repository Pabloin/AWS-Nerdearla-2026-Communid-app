import { Capacitor } from "@capacitor/core";

export const nativeAndroid = Capacitor.getPlatform() === "android";
if (nativeAndroid) document.documentElement.classList.add("native-android");

export async function scanNativeBadge(): Promise<string> {
  const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint, CapacitorBarcodeScannerAndroidScanningLibrary } = await import("@capacitor/barcode-scanner");
  const result = await CapacitorBarcodeScanner.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
    scanInstructions: "Escaneá el QR de otra persona en re:Invent",
    scanText: "Escanear badge",
    cancelButtonAccessibilityLabel: "Cancelar escaneo",
    android: { scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.ZXING },
  });
  return result.ScanResult;
}

export async function takeNativeSelfie(): Promise<string> {
  const { Camera } = await import("@capacitor/camera");
  const photo = await Camera.takePhoto({ quality: 82, targetWidth: 1600, targetHeight: 1600, saveToGallery: false, includeMetadata: false });
  if (!photo.webPath) throw new Error("La cámara no devolvió una foto. Volvé a intentarlo.");
  return photo.webPath;
}

// Only accept this app's public badges. Never switch tenants through an intent.
export function nativeBadgeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.port || url.username || url.password) return null;
    if (url.protocol === "comunid-reinvent:" && url.hostname === "b") {
      return `https://reinvent.comunid.app/b${url.pathname}`;
    }
    return url.protocol === "https:" && url.hostname === "reinvent.comunid.app" && !url.port && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
