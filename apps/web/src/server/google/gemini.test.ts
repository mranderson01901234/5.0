import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';
import { generateImage } from './gemini';

process.env.GOOGLE_API_KEY = 'test-key';

global.fetch = vi.fn();

describe('Gemini Image Generation', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        vi.resetAllMocks();
        process.env = { ...OLD_ENV };
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('should throw an error if GOOGLE_API_KEY is not set', async () => {
        process.env.GOOGLE_API_KEY = '';
        await expect(generateImage('a test prompt')).rejects.toThrow('GOOGLE_API_KEY is not set in environment variables.');
    });

    it('should return an array of images on successful API call', async () => {
        process.env.GOOGLE_API_KEY = 'test-key';
        const mockResponse = {
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                inlineData: {
                                    mimeType: 'image/png',
                                    data: 'base64-encoded-image-data',
                                },
                            },
                        ],
                    },
                },
            ],
        };
        (fetch as vi.Mock).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockResponse),
        });
        const images = await generateImage('a test prompt');
        expect(images).toEqual([
            {
                mime: 'image/png',
                dataUrl: 'data:image/png;base64,base64-encoded-image-data',
            },
        ]);
    });

    it('should handle API errors gracefully', async () => {
        process.env.GOOGLE_API_KEY = 'test-key';
        (fetch as vi.Mock).mockResolvedValue({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Internal Server Error'),
        });
        await expect(generateImage('a test prompt')).rejects.toThrow('Gemini API request failed with status 500: Internal Server Error');
    });

    it('should return an empty array if no candidates are returned', async () => {
        process.env.GOOGLE_API_KEY = 'test-key';
        (fetch as vi.Mock).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ candidates: [] }),
        });
        const images = await generateImage('a test prompt');
        expect(images).toEqual([]);
    });

    it('should filter out non-image parts from the response', async () => {
        process.env.GOOGLE_API_KEY = 'test-key';
        const mockResponse = {
            candidates: [
                {
                    content: {
                        parts: [
                            { text: 'This is not an image' },
                            {
                                inlineData: {
                                    mimeType: 'image/png',
                                    data: 'base64-encoded-image-data',
                                },
                            },
                        ],
                    },
                },
            ],
        };
        (fetch as vi.Mock).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockResponse),
        });
        const images = await generateImage('a test prompt');
        expect(images).toHaveLength(1);
        expect(images[0].mime).toBe('image/png');
    });
});
