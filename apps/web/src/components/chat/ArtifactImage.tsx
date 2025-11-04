import React, { useState, useRef, useEffect } from 'react';
import { ImageArtifact } from '../../store/artifactStore';
import { Download, Share2, ZoomIn, ZoomOut } from 'lucide-react';
import { log } from '../../utils/logger';

interface ArtifactImageProps {
    artifact: ImageArtifact;
    onRenderControls?: (controls: React.ReactNode) => void;
}

const ArtifactImage: React.FC<ArtifactImageProps> = ({ artifact, onRenderControls }) => {
    const { images } = artifact.data;
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const imageRef = useRef<HTMLDivElement>(null);

    const handleDownload = (dataUrl: string, index: number) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `image-${artifact.id}-${index}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleShare = async (dataUrl: string) => {
        try {
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const file = new File([blob], 'generated-image.png', { type: 'image/png' });

            if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Generated Image',
                    text: 'Generated image',
                });
            } else {
                // Fallback: copy to clipboard
                await navigator.clipboard.write([
                    new ClipboardItem({ [blob.type]: blob })
                ]);
                log.info('[ArtifactImage] Image copied to clipboard');
            }
        } catch (error) {
            log.error('Failed to share image', error);
        }
    };

    // Zoom controls
    const handleZoomIn = () => {
        setZoom(prev => Math.min(prev + 0.25, 3));
    };

    const handleZoomOut = () => {
        setZoom(prev => Math.max(prev - 0.25, 0.5));
    };

    const handleResetZoom = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    // Mouse wheel zoom with zoom to pointer location
    useEffect(() => {
        const container = imageRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();

            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left - rect.width / 2;
            const mouseY = e.clientY - rect.top - rect.height / 2;

            const delta = e.deltaY * -0.001;
            const newZoom = Math.max(0.5, Math.min(3, zoom + delta));
            const zoomRatio = newZoom / zoom;

            // Adjust pan to zoom towards mouse pointer
            setPan(prevPan => ({
                x: mouseX - (mouseX - prevPan.x) * zoomRatio,
                y: mouseY - (mouseY - prevPan.y) * zoomRatio,
            }));

            setZoom(newZoom);
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [zoom]);

    // Pan handlers (allow at all zoom levels)
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPan({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y,
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseLeave = () => {
        setIsDragging(false);
    };

    // Render controls to parent header
    useEffect(() => {
        if (onRenderControls) {
            const controls = (
                <>
                    {/* Zoom controls */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleZoomOut}
                            className="p-1 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
                            title="Zoom out"
                            aria-label="Zoom out"
                        >
                            <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={handleResetZoom}
                            className="px-2 py-0.5 text-xs text-white/60 hover:text-white/90 hover:bg-white/10 rounded transition-colors min-w-[2.5rem]"
                            title="Reset zoom & pan"
                        >
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            onClick={handleZoomIn}
                            className="p-1 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
                            title="Zoom in"
                            aria-label="Zoom in"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Separator */}
                    <div className="w-px h-4 bg-white/10" />

                    {/* Reset button */}
                    <button
                        onClick={handleResetZoom}
                        className="px-2 py-1 text-xs rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
                        title="Reset view"
                    >
                        Reset
                    </button>

                    {/* Separator */}
                    <div className="w-px h-4 bg-white/10" />

                    {/* Download & Share icons */}
                    {images.map((image, index) => (
                        <React.Fragment key={index}>
                            <button
                                onClick={() => handleDownload(image.dataUrl, index)}
                                className="p-1 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
                                title="Download image"
                                aria-label="Download image"
                            >
                                <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => handleShare(image.dataUrl)}
                                className="p-1 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
                                title="Share image"
                                aria-label="Share image"
                            >
                                <Share2 className="w-3.5 h-3.5" />
                            </button>
                        </React.Fragment>
                    ))}
                </>
            );
            onRenderControls(controls);
        }
    }, [zoom, images, onRenderControls]);

    return (
        <div className="flex flex-col h-full">

            {/* Image container - non-scrollable, fits image perfectly, with pan support */}
            <div
                ref={imageRef}
                className="flex-1 flex items-center justify-center overflow-hidden bg-black/20 select-none"
                style={{
                    minHeight: 0,
                    cursor: isDragging ? 'grabbing' : 'grab'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
            >
                {images.map((image, index) => (
                    <img
                        key={index}
                        src={image.dataUrl}
                        alt="Generated image"
                        className="max-w-full max-h-full w-auto h-auto object-contain"
                        style={{
                            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                            transition: isDragging ? 'none' : 'transform 0.2s',
                            imageRendering: zoom > 1 ? 'crisp-edges' : 'auto'
                        }}
                        draggable={false}
                    />
                ))}
            </div>
        </div>
    );
};

export default ArtifactImage;
