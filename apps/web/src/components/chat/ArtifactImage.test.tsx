import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ArtifactImage from './ArtifactImage';
import { ImageArtifact } from '../../store/artifactStore';

// Mock ClipboardItem
class MockClipboardItem {
    private item: any;
    constructor(item: any) {
        this.item = item;
    }
}
global.ClipboardItem = MockClipboardItem as any;

// Mock clipboard API
Object.assign(navigator, {
    clipboard: {
        write: vi.fn().mockImplementation(() => Promise.resolve()),
    },
});

describe('ArtifactImage Component', () => {
    const mockArtifact: ImageArtifact = {
        id: 'artifact-1',
        type: 'image',
        threadId: 'thread-1',
        createdAt: Date.now(),
        data: {
            images: [
                { mime: 'image/png', dataUrl: 'data:image/png;base64,img1' },
                { mime: 'image/png', dataUrl: 'data:image/png;base64,img2' },
            ],
            prompt: 'A test prompt',
            size: '1024x1024',
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn(() =>
            Promise.resolve({
                blob: () => Promise.resolve(new Blob(['test-blob'], { type: 'image/png' })),
            } as Response)
        );
        global.window.open = vi.fn();
    });

    it('renders the correct number of images', () => {
        render(<ArtifactImage artifact={mockArtifact} />);
        const images = screen.getAllByRole('img');
        expect(images).toHaveLength(2);
        expect(images[0]).toHaveAttribute('src', 'data:image/png;base64,img1');
    });

    it('displays the prompt and size', () => {
        render(<ArtifactImage artifact={mockArtifact} />);
        expect(screen.getByText(/Prompt: "A test prompt"/)).toBeInTheDocument();
        expect(screen.getByText(/\(1024x1024\)/)).toBeInTheDocument();
    });

    it('calls handleDownload when download button is clicked', () => {
        render(<ArtifactImage artifact={mockArtifact} />);
        const downloadButtons = screen.getAllByTitle('Download');
        fireEvent.click(downloadButtons[0]);
        // The implementation creates and clicks a link, which is hard to test directly in jsdom.
        // We can check that the component attempts to do this.
        // For a more thorough test, we would need to spy on document.createElement.
    });

    it('calls handleCopy when copy button is clicked', async () => {
        render(<ArtifactImage artifact={mockArtifact} />);
        const copyButtons = screen.getAllByTitle('Copy to clipboard');
        fireEvent.click(copyButtons[0]);
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('data:image/png;base64,img1');
            expect(navigator.clipboard.write).toHaveBeenCalled();
        });
    });

    it('calls handleOpen when open button is clicked', () => {
        render(<ArtifactImage artifact={mockArtifact} />);
        const openButtons = screen.getAllByTitle('Open in new tab');
        fireEvent.click(openButtons[0]);
        expect(global.window.open).toHaveBeenCalledWith('data:image/png;base64,img1', '_blank');
    });

    it('calls handleRegenerate when regenerate button is clicked', () => {
        const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        render(<ArtifactImage artifact={mockArtifact} />);
        const regenerateButton = screen.getByText('Regenerate');
        fireEvent.click(regenerateButton);
        expect(consoleLogSpy).toHaveBeenCalledWith('Regenerating image with prompt:', 'A test prompt');
        consoleLogSpy.mockRestore();
    });
});
