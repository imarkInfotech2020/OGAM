import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PasteNoteSheet } from '../../../src/components/knowledge/PasteNoteSheet';

/**
 * Pasting a page you copied straight into a knowledge base.
 *
 * Most of what someone wants a model to know is not a file - it is a page they copied, a spec, a thread.
 * Saving it as a document first and importing it is a detour through the filesystem for nothing, so this
 * sheet is the shortcut, and what it saves becomes an ordinary document that is indexed, searchable and
 * synced like any other.
 *
 * Driven the way a person drives it: type, tap, read what the screen says. The cases that matter are the
 * ones where a note could be lost - an empty save that pretends to work, a note whose text is still on
 * screen after a failure, or a sheet reopened still holding the last note's text.
 */
describe('pasting text into a knowledge base', () => {
  const sheet = (
    props: Partial<React.ComponentProps<typeof PasteNoteSheet>> = {},
  ) => {
    const saved: Array<[string, string]> = [];
    const closes: number[] = [];
    const view = render(
      <PasteNoteSheet
        visible
        onClose={() => closes.push(1)}
        onSave={async (title, text) => {
          saved.push([title, text]);
        }}
        {...props}
      />,
    );
    return { view, saved, closes };
  };

  it('saves what was pasted and closes itself', async () => {
    const { view, saved, closes } = sheet();

    fireEvent.changeText(view.getByTestId('paste-note-title'), 'Q3 plan');
    fireEvent.changeText(
      view.getByTestId('paste-note-text'),
      'the whole page, pasted',
    );
    fireEvent.press(view.getByTestId('paste-note-save'));

    await waitFor(() =>
      expect(saved).toEqual([['Q3 plan', 'the whole page, pasted']]),
    );
    // Closing is what tells the user it worked - the note is then in the list behind the sheet.
    expect(closes).toHaveLength(1);
  });

  it('saves an untitled note rather than refusing to', async () => {
    const { view, saved } = sheet();

    fireEvent.changeText(view.getByTestId('paste-note-text'), 'just this');
    fireEvent.press(view.getByTestId('paste-note-save'));

    // The title is optional, and the note gets stamped with the moment it was saved further down. Demanding
    // one here would turn a paste into a form.
    await waitFor(() => expect(saved).toEqual([['', 'just this']]));
  });

  it('will not save an empty note', () => {
    const { view, saved } = sheet();

    fireEvent.press(view.getByTestId('paste-note-save'));

    expect(saved).toEqual([]);
    expect(
      view.getByTestId('paste-note-save').props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('will not save a note that is only whitespace', () => {
    const { view, saved } = sheet();

    fireEvent.changeText(view.getByTestId('paste-note-text'), '   \n  ');
    fireEvent.press(view.getByTestId('paste-note-save'));

    // A blank document would be indexed, synced and searchable, and would match nothing for ever.
    expect(saved).toEqual([]);
  });

  it('offers to save as soon as there is something to save', () => {
    const { view } = sheet();
    expect(
      view.getByTestId('paste-note-save').props.accessibilityState,
    ).toMatchObject({ disabled: true });

    fireEvent.changeText(view.getByTestId('paste-note-text'), 'a');

    expect(
      view.getByTestId('paste-note-save').props.accessibilityState,
    ).toMatchObject({ disabled: false });
  });

  it('says how much was pasted, which the field cannot show', () => {
    const { view } = sheet();
    expect(view.queryByText(/characters/)).toBeNull();

    fireEvent.changeText(view.getByTestId('paste-note-text'), 'x'.repeat(4210));

    // Grouped, because the number is the point: a paste that took half a page is a different thing from one
    // that took forty.
    expect(view.getByText('4,210 characters')).toBeTruthy();
  });

  it('stops saying how much was pasted once the text is cleared', () => {
    const { view } = sheet();
    fireEvent.changeText(view.getByTestId('paste-note-text'), 'something');

    fireEvent.changeText(view.getByTestId('paste-note-text'), '');

    expect(view.queryByText(/characters/)).toBeNull();
  });

  it('keeps the text on screen and says why when saving fails', async () => {
    const { view, closes } = sheet({
      onSave: async () => {
        throw new Error('The knowledge base is full.');
      },
    });
    fireEvent.changeText(view.getByTestId('paste-note-text'), 'do not lose me');

    fireEvent.press(view.getByTestId('paste-note-save'));

    expect(await view.findByRole('alert')).toHaveTextContent(
      'The knowledge base is full.',
    );
    // Still open, still holding the text: closing on a failure would throw away what the user pasted.
    expect(closes).toEqual([]);
    expect(view.getByTestId('paste-note-text').props.value).toBe(
      'do not lose me',
    );
  });

  it('says something useful when the failure carries no message', async () => {
    const { view } = sheet({
      onSave: async () => {
        throw 'the native module rejected';
      },
    });
    fireEvent.changeText(view.getByTestId('paste-note-text'), 'text');

    fireEvent.press(view.getByTestId('paste-note-save'));

    expect(await view.findByRole('alert')).toHaveTextContent(
      'Could not save this note.',
    );
  });

  it('lets the note be saved again after a failure', async () => {
    let attempts = 0;
    const saved: string[] = [];
    const view = render(
      <PasteNoteSheet
        visible
        onClose={() => {}}
        onSave={async (_title, text) => {
          attempts += 1;
          if (attempts === 1) throw new Error('The disk is full.');
          saved.push(text);
        }}
      />,
    );
    fireEvent.changeText(view.getByTestId('paste-note-text'), 'retry me');
    fireEvent.press(view.getByTestId('paste-note-save'));
    await view.findByRole('alert');

    fireEvent.press(view.getByTestId('paste-note-save'));

    // The button has to come back to life, or a transient failure means retyping the whole paste.
    await waitFor(() => expect(saved).toEqual(['retry me']));
    expect(view.queryByRole('alert')).toBeNull();
  });

  it('saves once however many times the button is tapped', async () => {
    let release: (() => void) | undefined;
    const saved: string[] = [];
    const view = render(
      <PasteNoteSheet
        visible
        onClose={() => {}}
        onSave={async (_title, text) => {
          saved.push(text);
          await new Promise<void>(resolve => {
            release = resolve;
          });
        }}
      />,
    );
    fireEvent.changeText(view.getByTestId('paste-note-text'), 'one note');

    fireEvent.press(view.getByTestId('paste-note-save'));
    fireEvent.press(view.getByTestId('paste-note-save'));
    fireEvent.press(view.getByTestId('paste-note-save'));

    // An impatient second tap while the write is in flight would file the same page twice, and both copies
    // would then sync.
    expect(saved).toEqual(['one note']);
    release?.();
    await waitFor(() => expect(saved).toEqual(['one note']));
  });

  it('cannot be closed while it is still writing', async () => {
    let release: (() => void) | undefined;
    const closes: number[] = [];
    const view = render(
      <PasteNoteSheet
        visible
        onClose={() => closes.push(1)}
        onSave={async () => {
          await new Promise<void>(resolve => {
            release = resolve;
          });
        }}
      />,
    );
    fireEvent.changeText(view.getByTestId('paste-note-text'), 'mid-write');
    fireEvent.press(view.getByTestId('paste-note-save'));

    fireEvent.press(view.getByText('Cancel'));

    // Dismissing mid-write would unmount the sheet while the file is being written, and the note would be
    // half a document.
    expect(closes).toEqual([]);
    release?.();
    await waitFor(() => expect(closes).toEqual([1]));
  });

  it('can be closed without saving', () => {
    const { view, closes, saved } = sheet();
    fireEvent.changeText(
      view.getByTestId('paste-note-text'),
      'changed my mind',
    );

    fireEvent.press(view.getByText('Cancel'));

    expect(closes).toEqual([1]);
    expect(saved).toEqual([]);
  });

  it('opens empty after a note was already saved through it', async () => {
    const view = render(
      <PasteNoteSheet visible onClose={() => {}} onSave={async () => {}} />,
    );
    fireEvent.changeText(view.getByTestId('paste-note-title'), 'Last note');
    fireEvent.changeText(view.getByTestId('paste-note-text'), 'the last paste');

    view.update(
      <PasteNoteSheet
        visible={false}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    );
    view.update(
      <PasteNoteSheet visible onClose={() => {}} onSave={async () => {}} />,
    );

    // Reopening on top of the last note is how someone accidentally saves the same page twice, or appends a
    // new thought to an old one.
    expect(view.getByTestId('paste-note-title').props.value).toBe('');
    expect(view.getByTestId('paste-note-text').props.value).toBe('');
    expect(view.queryByText(/characters/)).toBeNull();
  });

  it('clears a failure it was showing when it is reopened', async () => {
    const props = {
      onClose: () => {},
      onSave: async () => {
        throw new Error('The disk is full.');
      },
    };
    const view = render(<PasteNoteSheet visible {...props} />);
    fireEvent.changeText(view.getByTestId('paste-note-text'), 'text');
    fireEvent.press(view.getByTestId('paste-note-save'));
    await view.findByRole('alert');

    view.update(<PasteNoteSheet visible={false} {...props} />);
    view.update(<PasteNoteSheet visible {...props} />);

    // A stale error over an empty sheet reads as a failure that just happened.
    expect(view.queryByRole('alert')).toBeNull();
  });

  it('caps the title at what a filename can hold', () => {
    const { view } = sheet();

    // The title becomes the filename further down, so the field itself is what keeps it short - a limit
    // enforced only at write time would truncate silently after the sheet closed.
    expect(view.getByTestId('paste-note-title').props.maxLength).toBe(60);
  });
});
