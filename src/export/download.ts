export function downloadFile({
  name,
  blob,
}: {
  name: string;
  blob: Blob;
}): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  }
}
