import React from 'react';
import { render, screen } from '@testing-library/react';
import MessageContent from '@/components/chat/MessageContent';
import { withProviders } from '../../../tests/utils';

const renderMC = (content: string) =>
  render(withProviders(<MessageContent content={content} />));

test('strips script tags', () => {
  renderMC('hello<script>alert(1)</script>world');
  const el = screen.getByText(/hello/i).parentElement!;
  expect(el.innerHTML).not.toMatch(/<script/i);
  expect(el).toHaveTextContent(/hello.*world/i);
});

test('autolinks http(s) safely', () => {
  renderMC('See http://example.com and https://example.com');
  const links = screen.getAllByRole('link');
  // Should have at least 2 links
  expect(links.length).toBeGreaterThanOrEqual(2);
  links.forEach((a) => {
    const href = a.getAttribute('href');
    // Verify href exists and is a valid URL
    expect(href).toBeTruthy();
    expect(href).toMatch(/^https?:\/\//);
    // Check for rel attribute with noopener (linkify adds rel but may not add target)
    const html = a.outerHTML;
    expect(html).toMatch(/rel=["'][^"']*noopener[^"']*["']/);
  });
});

test('blocks javascript: and data: urls', () => {
  renderMC('javascript:alert(1) data:text/html,boom');
  // These should not be rendered as links
  const links = screen.queryAllByRole('link');
  // Check that no links have dangerous protocols
  links.forEach((link) => {
    const href = link.getAttribute('href');
    expect(href).not.toMatch(/^javascript:/i);
    expect(href).not.toMatch(/^data:/i);
  });
});

