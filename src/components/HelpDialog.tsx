import { Icon, Modal } from './ui';

type HelpView = 'home' | 'services' | 'browser' | 'settings';

const ACTIONS: Array<{
  id: string;
  title: string;
  body: string;
  icon: 'plus' | 'layers' | 'globe' | 'sliders';
  view?: HelpView;
}> = [
  {
    id: 'add',
    title: 'Add a service',
    body: 'Turn any web app into a module.',
    icon: 'plus',
  },
  {
    id: 'services',
    title: 'Browse services',
    body: 'Open, search, pin or edit your modules.',
    icon: 'layers',
    view: 'services',
  },
  {
    id: 'browser',
    title: 'Open the browser',
    body: 'Use a separate tabbed browsing space.',
    icon: 'globe',
    view: 'browser',
  },
  {
    id: 'settings',
    title: 'Open settings',
    body: 'Change themes, shield, extensions and startup.',
    icon: 'sliders',
    view: 'settings',
  },
];

export function HelpDialog({
  onClose,
  onAdd,
  onNavigate,
}: {
  onClose: () => void;
  onAdd: () => void;
  onNavigate: (view: HelpView) => void;
}) {
  function run(action: (typeof ACTIONS)[number]) {
    onClose();
    if (action.id === 'add') {
      onAdd();
      return;
    }
    if (action.view) onNavigate(action.view);
  }

  return (
    <Modal
      title="Quick help"
      subtitle="Every action has a visible button. Keyboard shortcuts are optional."
      onClose={onClose}
      width={560}
      footer={
        <>
          <span className="modal-hint">NO SHORTCUT REQUIRED</span>
          <button className="btn secondary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="help-actions">
        {ACTIONS.map(action => (
          <button key={action.id} className="help-action" onClick={() => run(action)}>
            <span className="help-action-icon">
              <Icon name={action.icon} size={19} />
            </span>
            <span className="help-action-copy">
              <strong>{action.title}</strong>
              <small>{action.body}</small>
            </span>
            <Icon name="chevron" size={14} className="help-action-arrow" />
          </button>
        ))}
      </div>

      <section className="help-keys" aria-labelledby="help-keys-title">
        <div className="section-head">
          <h3 id="help-keys-title">Keyboard shortcuts</h3>
          <span className="mono muted-label">OPTIONAL</span>
        </div>
        <dl>
          <div>
            <dt>Search and actions</dt>
            <dd>
              <kbd>Ctrl K</kbd>
            </dd>
          </div>
          <div>
            <dt>Jump to Home / Services / Browser / Settings</dt>
            <dd>
              <kbd>Ctrl 1–4</kbd>
            </dd>
          </div>
          <div>
            <dt>Close a dialog or menu</dt>
            <dd>
              <kbd>Esc</kbd>
            </dd>
          </div>
        </dl>
      </section>

      <p className="help-note">
        You can reach every view from the sidebar and every common action from the Home screen.
        Your workspace stays on this machine.
      </p>
    </Modal>
  );
}
