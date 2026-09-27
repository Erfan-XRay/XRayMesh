// Copy buttons: any element with data-xr-copy="text" copies that text and briefly shows
// data-label-done in its .xr-copy-text. One listener serves every button on the page.
document.addEventListener('click', async (event) => {
	const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-xr-copy]');
	if (!button) return;
	const text = button.dataset.xrCopy ?? '';
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		const area = document.createElement('textarea');
		area.value = text;
		area.style.position = 'fixed';
		area.style.opacity = '0';
		document.body.append(area);
		area.select();
		document.execCommand('copy');
		area.remove();
	}
	const label = button.querySelector('.xr-copy-text');
	button.classList.add('is-done');
	if (label) label.textContent = button.dataset.labelDone ?? '';
	window.setTimeout(() => {
		button.classList.remove('is-done');
		if (label) label.textContent = button.dataset.labelCopy ?? '';
	}, 1800);
});
