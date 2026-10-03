import React, { useEffect, useId, useState } from 'react';
import { Info, Loader2, TimerReset } from 'lucide-react';
import { NodeActionError, fetchRestartSchedule, saveRestartSchedule } from '../../services/api';
import { Peer, RestartSchedule } from '../../types';
import type { Translate } from '../../i18n/translations';
import { fillTemplate, formatText } from '../../i18n/fillTemplate';
import { btnPrimary, btnSecondary, hintClass, labelClass, Segmented } from '../ui';
import { ErrorPanel, SwitchField, TextField } from '../NodeConfig/FormControls';
import { updateErrorText } from '../Peers/peerDisplay';
import {
  formatAgo,
  formatInterval,
  IntervalUnit,
  RESTART_MAX_MINUTES,
  RESTART_MIN_MINUTES,
  RESTART_PRESETS,
  splitInterval,
  UNIT_MINUTES,
} from '../Peers/restartDisplay';
import { ModalClose, ModalShell } from './ModalShell';

interface RestartScheduleModalProps {
  /** The server being scheduled; the dialog is open while this is set. */
  peer: Peer | null;
  onClose: () => void;
  /** Called with the schedule the server saved. */
  onSaved: (peer: Peer, schedule: RestartSchedule) => void;
  t: Translate;
}

type Load =
  | { state: 'loading' }
  | { state: 'ready'; schedule: RestartSchedule }
  | { state: 'failed'; message: string; details?: string };

const failure = (err: unknown, host: string, t: Translate) => {
  const code = err instanceof NodeActionError ? err.code : '';
  return { message: updateErrorText(code, host, t), details: err instanceof Error ? err.message : undefined };
};

/** Turn a server's scheduled restart on or off and pick how often it runs. */
export const RestartScheduleModal: React.FC<RestartScheduleModalProps> = ({ peer, onClose, onSaved, t }) => {
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [enabled, setEnabled] = useState(false);
  const [choice, setChoice] = useState<number | 'custom'>(RESTART_PRESETS[3]);
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState<IntervalUnit>('hours');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; details?: string } | null>(null);
  const [touched, setTouched] = useState(false);

  const ip = peer?.ipv4;
  const host = peer ? peer.hostname || peer.ipv4 : '';

  useEffect(() => {
    if (!ip) return;
    let cancelled = false;
    setLoad({ state: 'loading' });
    setSaveError(null);
    setTouched(false);
    fetchRestartSchedule(ip)
      .then((schedule) => {
        if (cancelled) return;
        const minutes = schedule.interval_minutes;
        setEnabled(schedule.enabled);
        if (RESTART_PRESETS.includes(minutes)) {
          setChoice(minutes);
        } else {
          const { value, unit } = splitInterval(minutes);
          setChoice('custom');
          setCustomValue(String(value));
          setCustomUnit(unit);
        }
        setLoad({ state: 'ready', schedule });
      })
      .catch((err) => {
        if (!cancelled) setLoad({ state: 'failed', ...failure(err, host, t) });
      });
    return () => {
      cancelled = true;
    };
    // The language only changes the wording of an error that is already shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip]);

  const customMinutes = /^\d+$/.test(customValue) ? Number(customValue) * UNIT_MINUTES[customUnit] : NaN;
  const minutes = choice === 'custom' ? customMinutes : choice;
  const intervalValid = Number.isInteger(minutes) && minutes >= RESTART_MIN_MINUTES && minutes <= RESTART_MAX_MINUTES;
  const customError = choice === 'custom' && touched && !intervalValid ? t('restart_interval_invalid') : null;

  const save = async () => {
    if (!peer || load.state !== 'ready') return;
    if (enabled && !intervalValid) {
      setTouched(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // Turning it off keeps the interval the server already has.
      const schedule = await saveRestartSchedule(peer.ipv4, enabled, enabled ? minutes : load.schedule.interval_minutes);
      onSaved(peer, schedule);
    } catch (err) {
      setSaveError(failure(err, host, t));
    } finally {
      setSaving(false);
    }
  };

  const lastRestart = load.state === 'ready' ? load.schedule.last_restart_at || 0 : 0;

  return (
    <ModalShell isOpen={Boolean(peer)} onClose={onClose} closable={!saving} labelledBy={titleId} maxWidth="sm:max-w-md">
      <div className="flex items-start gap-3.5">
        <span className="flex items-center justify-center w-10 h-10 shrink-0 rounded-xl bg-primary-subtle text-primary" aria-hidden="true">
          <TimerReset className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 id={titleId} className="text-base font-semibold text-text-primary leading-snug">
            {fillTemplate(t('restart_modal_title'), { host: <bdi>{host}</bdi> })}
          </h2>
          <p className="mt-1.5 text-sm text-text-muted leading-relaxed">{t('restart_modal_desc')}</p>
        </div>
        <ModalClose onClick={onClose} label={t('nav_close')} disabled={saving} />
      </div>

      <div className="mt-5 space-y-5">
        {load.state === 'loading' && (
          <p role="status" className="flex items-center gap-2 py-6 justify-center text-sm text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            {t('restart_loading')}
          </p>
        )}

        {load.state === 'failed' && <ErrorPanel message={load.message} details={load.details} t={t} />}

        {load.state === 'ready' && (
          <>
            <SwitchField label={t('restart_toggle_label')} hint={t('restart_toggle_hint')} checked={enabled} onChange={setEnabled} disabled={saving} />

            {enabled && (
              <fieldset className="space-y-3 animate-fade-in" disabled={saving}>
                <legend className={`${labelClass} mb-2`}>{t('restart_interval_label')}</legend>
                <div className="grid grid-cols-3 gap-2">
                  {[...RESTART_PRESETS, 'custom' as const].map((option) => {
                    const active = choice === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setChoice(option)}
                        className={`min-h-10 px-2 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-primary-subtle border-primary-border text-primary'
                            : 'bg-card border-card-border text-text-secondary hover:bg-hover hover:border-border-strong'
                        }`}
                      >
                        {option === 'custom' ? t('restart_custom') : formatInterval(option, t)}
                      </button>
                    );
                  })}
                </div>

                {choice === 'custom' && (
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3 animate-fade-in">
                    <div className="flex-1">
                      <TextField
                        label={t('restart_custom')}
                        value={customValue}
                        onChange={(v) => {
                          setCustomValue(v);
                          setTouched(true);
                        }}
                        numeric
                        technical
                        autoFocus
                        maxLength={5}
                        hint={t('restart_interval_range')}
                        error={customError}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className={labelClass}>{t('restart_unit_label')}</span>
                      <Segmented
                        value={customUnit}
                        onChange={setCustomUnit}
                        ariaLabel={t('restart_unit_label')}
                        options={[
                          { value: 'minutes', label: t('restart_unit_minutes') },
                          { value: 'hours', label: t('restart_unit_hours') },
                          { value: 'days', label: t('restart_unit_days') },
                        ]}
                      />
                    </div>
                  </div>
                )}

                <p className={`${hintClass} flex items-start gap-1.5`}>
                  <Info className="w-3.5 h-3.5 mt-[0.2em] shrink-0" aria-hidden="true" />
                  <span>{t('restart_note_downtime')}</span>
                </p>
              </fieldset>
            )}

            <p className={hintClass}>
              {lastRestart
                ? formatText(t('restart_last'), { when: formatAgo(lastRestart, t) })
                : t('restart_never')}
            </p>
          </>
        )}

        {saveError && <ErrorPanel message={saveError.message} details={saveError.details} t={t} />}
      </div>

      <div className="mt-6 grid grid-cols-1 sm:flex sm:justify-end gap-2">
        <button type="button" onClick={save} disabled={saving || load.state !== 'ready'} className={`${btnPrimary} sm:order-last`}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          <span>{t('restart_save')}</span>
        </button>
        <button type="button" onClick={onClose} disabled={saving} className={btnSecondary}>
          {t('btn_cancel')}
        </button>
      </div>
    </ModalShell>
  );
};
