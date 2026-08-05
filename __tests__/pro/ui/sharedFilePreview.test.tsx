/**
 * The preview under a shared file: what the user sees before deciding to open it.
 *
 * This is the difference between a file list and a useful one. A row that shows the first lines of a document, or
 * the image itself, tells the user whether they want it; a row that shows nothing makes them open every file to
 * find out. So the interesting cases are all the ways a preview cannot be produced - the bytes are not on this
 * phone, the type is not previewable, the read failed, the file is empty - because each one has to say something
 * different and none may leave a blank space or a spinner that never resolves.
 *
 * The projection is the production one (`projectSharedFilePreview`), so what counts as previewable and which way
 * up an image is are decided the way the app decides them. The filesystem is the repo's react-native-fs boundary
 * fake, which is the device.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import RNFS from 'react-native-fs';
import { projectSharedFilePreview } from '@offgrid/sync';
import { getTheme } from '../../../src/theme';
import { requirePro } from '../helpers/requirePro';

jest.mock('react-native-vector-icons/Feather', () => {
  const { Text } = require('react-native');
  return ({ name }: { name: string }) => <Text>{name}</Text>;
});

type PreviewModule = typeof import('@offgrid/pro/ui/SyncScreen/SharedFilePreview');
type StylesModule = typeof import('@offgrid/pro/ui/SyncScreen/styles');

let SharedFilePreview: PreviewModule['SharedFilePreview'];
let fileUri: PreviewModule['fileUri'];
let styles: ReturnType<StylesModule['createStyles']>;
let available = true;

beforeAll(() => {
  const preview = requirePro<PreviewModule>(
    '@offgrid/pro/ui/SyncScreen/SharedFilePreview',
  );
  const stylesModule = requirePro<StylesModule>('@offgrid/pro/ui/SyncScreen/styles');
  if (!preview || !stylesModule) {
    available = false;
    return;
  }
  SharedFilePreview = preview.SharedFilePreview;
  fileUri = preview.fileUri;
  // The app's real dark palette, not a hand-rolled one, so the component renders its production tree.
  const theme = getTheme('dark');
  styles = stylesModule.createStyles(theme.colors, theme.shadows);
});

const item = (over: Record<string, unknown> = {}) =>
  ({
    syncId: '55555555-5555-4555-8555-555555555555',
    name: 'Notes.txt',
    mimeType: 'text/plain',
    fileSize: 128,
    createdAt: '2026-03-01T00:00:00.000Z',
    localPath: '/mock/documents/shared_files/Notes.txt',
    ...over,
  }) as never;

const readReturns = (value: string | Error): void => {
  const read = RNFS.read as jest.Mock;
  if (value instanceof Error) read.mockRejectedValue(value);
  else read.mockResolvedValue(value);
};

beforeEach(() => {
  jest.clearAllMocks();
  readReturns('');
});

const preview = (input: {
  name: string;
  mimeType: string;
  available: boolean;
  width?: number;
  height?: number;
}) => projectSharedFilePreview(input);

describe('the preview under a shared file', () => {
  it('says the file is not on this phone when the bytes are missing', () => {
    if (!available) return;

    const ui = render(
      <SharedFilePreview
        name="Notes.txt"
        preview={preview({ name: 'Notes.txt', mimeType: 'text/plain', available: false })}
        styles={styles}
      />,
    );

    // The record synced but the bytes did not, which is the normal state for a file another device owns. Saying
    // so is what stops the user tapping a row that can only disappoint them.
    expect(ui.getByText(/unavailable on this phone/)).toBeTruthy();
  });

  it("uses the caller's own wording when there is a better explanation", () => {
    if (!available) return;

    const ui = render(
      <SharedFilePreview
        name="Notes.txt"
        preview={preview({ name: 'Notes.txt', mimeType: 'text/plain', available: false })}
        message="Still sending from The Mac."
        styles={styles}
      />,
    );

    // A transfer in flight is not the same as a file that will never arrive, and the Activity row knows which.
    expect(ui.getByText('Still sending from The Mac.')).toBeTruthy();
    expect(ui.queryByText(/unavailable on this phone/)).toBeNull();
  });

  it('says so plainly for a type it cannot preview', () => {
    if (!available) return;

    const ui = render(
      <SharedFilePreview
        name="archive.zip"
        preview={preview({
          name: 'archive.zip',
          mimeType: 'application/zip',
          available: true,
        })}
        file={item({ name: 'archive.zip', mimeType: 'application/zip' })}
        styles={styles}
      />,
    );

    // Not an error - a zip simply has nothing to show. Blank space would read as a failure.
    expect(ui.getByText(/not available for this file type/)).toBeTruthy();
  });

  it('shows an image, labelled for a screen reader, the right way up', () => {
    if (!available) return;
    // Asserted as a property rather than an exact number: the projection reserves a normalised thumbnail box, and
    // what the user needs is that a tall photo gets a tall box - not that the box is any particular size.
    const shapes: Array<[string, number, number, 'wider' | 'taller' | 'equal']> = [
      ['landscape', 1600, 900, 'wider'],
      ['portrait', 900, 1600, 'taller'],
      ['square', 800, 800, 'equal'],
    ];

    for (const [label, width, height, shape] of shapes) {
      const ui = render(
        <SharedFilePreview
          name={`${label}.png`}
          preview={preview({
            name: `${label}.png`,
            mimeType: 'image/png',
            available: true,
            width,
            height,
          })}
          file={item({ name: `${label}.png`, mimeType: 'image/png' })}
          styles={styles}
        />,
      );

      // The aspect ratio is what keeps a tall photo from being rendered as a letterbox. And the label is the only
      // way a screen reader can describe the image at all.
      const image = ui.getByLabelText(`Preview of ${label}.png`);
      expect(image).toBeTruthy();
      const style = ([] as unknown[]).concat(image.props.style).find(
        entry => entry && typeof entry === 'object' && 'aspectRatio' in entry,
      ) as { aspectRatio: number };
      if (shape === 'wider') expect(style.aspectRatio).toBeGreaterThan(1);
      if (shape === 'taller') expect(style.aspectRatio).toBeLessThan(1);
      if (shape === 'equal') expect(style.aspectRatio).toBe(1);
    }
  });

  it('reads a text file and shows what is in it', async () => {
    if (!available) return;
    readReturns('The first lines of the document.');

    const ui = render(
      <SharedFilePreview
        name="Notes.txt"
        preview={preview({ name: 'Notes.txt', mimeType: 'text/plain', available: true })}
        file={item()}
        styles={styles}
      />,
    );

    // Waiting first, because reading a file is asynchronous and the row shows a spinner until it lands - a
    // preview that appeared synchronously would mean it was not reading the file at all.
    expect(ui.getByText(/Loading preview/)).toBeTruthy();
    await waitFor(() =>
      expect(ui.getByText('The first lines of the document.')).toBeTruthy(),
    );
    expect(RNFS.read).toHaveBeenCalledWith(
      '/mock/documents/shared_files/Notes.txt',
      expect.any(Number),
      0,
      'utf8',
    );
  });

  it('tells the user to open the file when the read fails', async () => {
    if (!available) return;
    readReturns(new Error('permission denied'));

    const ui = render(
      <SharedFilePreview
        name="Notes.txt"
        preview={preview({ name: 'Notes.txt', mimeType: 'text/plain', available: true })}
        file={item()}
        styles={styles}
      />,
    );

    // The file IS there - only the preview failed - so the message points at opening it rather than claiming the
    // file is gone. A spinner left spinning would be the worst of the three outcomes.
    await waitFor(() =>
      expect(ui.getByText(/No readable preview is available/)).toBeTruthy(),
    );
  });

  it('treats an empty file the same as one it cannot read', async () => {
    if (!available) return;
    readReturns('   ');

    const ui = render(
      <SharedFilePreview
        name="Empty.txt"
        preview={preview({ name: 'Empty.txt', mimeType: 'text/plain', available: true })}
        file={item({ name: 'Empty.txt' })}
        styles={styles}
      />,
    );

    // Whitespace is not a preview. Rendering it would leave an empty box the user cannot interpret.
    await waitFor(() =>
      expect(ui.getByText(/No readable preview is available/)).toBeTruthy(),
    );
  });

  it('does not try to read anything for a file that is not here', () => {
    if (!available) return;

    render(
      <SharedFilePreview
        name="Notes.txt"
        preview={preview({ name: 'Notes.txt', mimeType: 'text/plain', available: false })}
        styles={styles}
      />,
    );

    expect(RNFS.read).not.toHaveBeenCalled();
  });

  it('does not read a PDF as raw text', async () => {
    if (!available) return;
    readReturns('%PDF-1.7 binary rubbish');

    const ui = render(
      <SharedFilePreview
        name="Contract.pdf"
        preview={preview({
          name: 'Contract.pdf',
          mimeType: 'application/pdf',
          available: true,
        })}
        file={item({ name: 'Contract.pdf', mimeType: 'application/pdf' })}
        styles={styles}
      />,
    );

    // A PDF goes through the extractor, never through a utf8 read: the first bytes of a PDF are binary, and
    // showing them to the user as a preview is worse than showing nothing. Here the extractor has no real file to
    // work with, so the row settles on the fallback rather than rendering '%PDF-1.7 binary rubbish'.
    await waitFor(() =>
      expect(ui.getByText(/No readable preview is available/)).toBeTruthy(),
    );
    expect(RNFS.read).not.toHaveBeenCalled();
    expect(ui.queryByText(/binary rubbish/)).toBeNull();
  });

  it('makes a path into something the image loader accepts, exactly once', () => {
    if (!available) return;

    // Double-prefixing is the bug this guards: 'file://file:///...' fails to load and shows an empty box.
    expect(fileUri('/mock/documents/a.png')).toBe('file:///mock/documents/a.png');
    expect(fileUri('file:///mock/documents/a.png')).toBe(
      'file:///mock/documents/a.png',
    );
  });
});
