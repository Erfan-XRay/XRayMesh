/**
 * Bulletproof clipboard copy utility supporting both Secure Contexts (HTTPS/localhost)
 * and Insecure Contexts (plain HTTP over VPS IP addresses).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern Async Clipboard API in secure contexts
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // If rejected by browser permissions, fallback to execCommand below
    }
  }

  // 2. Fallback: Hidden textarea using document.execCommand('copy')
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // Keep it off-screen and invisible without display:none
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus({ preventScroll: true });
    textArea.select();
    
    // Support mobile Safari selection range
    textArea.setSelectionRange(0, text.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return Boolean(successful);
  } catch (err) {
    console.error('Failed to copy text using fallback:', err);
    return false;
  }
}
