import { useApp } from '../store/AppContext.jsx';

export default function KillSwitchButton() {
  const { risk, killSwitch } = useApp();
  const on = !!risk?.killSwitch;
  const toggle = async () => {
    if (!on && !window.confirm('Activate KILL SWITCH? This halts all (paper) trading immediately.')) return;
    await killSwitch(!on);
  };
  return (
    <button className={'kill' + (on ? ' active' : '')} onClick={toggle} title="Halt all trading immediately">
      ■ {on ? 'KILL ACTIVE' : 'KILL SWITCH'}
    </button>
  );
}
