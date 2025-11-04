import React from "react";
import { createPortal } from "react-dom";

type Props = { children: React.ReactNode };

/**
 * ArtifactPortal - Renders ArtifactPane through a React Portal
 * into a dedicated scroll root (#artifact-root) for hard isolation
 * from chat container scroll behavior.
 */
export default function ArtifactPortal({ children }: Props) {
  const [node, setNode] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    // Find the portal target element
    const target = document.getElementById("artifact-root");
    setNode(target);
  }, []);

  if (!node) return null;

  return createPortal(children, node);
}

