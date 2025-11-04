/**
 * Scroll an artifact card into view with smooth scrolling
 * @param id - Artifact ID (without prefix)
 */
export function scrollArtifactIntoView(id: string): void {
  const elementId = `artifact-${id}`;
  const el = document.getElementById(elementId);
  
  if (!el) {
    console.warn(`[scrollIntoViewAnchor] Element not found: ${elementId}`);
    return;
  }

  // Use smooth scrolling with center alignment
  el.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest',
  });

  console.log(`[artifact-inline] scrolled into view: ${id}`);
}

