import { type JSX, useCallback, useEffect, useState } from 'react'
import { Box, Button, Checkbox, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import type { AiConfigView } from '@shared/aiChat'
import { AI_MODEL_OPTIONS } from '@shared/aiModels'
import { AI_PROVIDER_INFO, AI_PROVIDERS, type AiProvider } from '@shared/aiProviders'
import { parseSourceList } from '@shared/aiSources'
import type { PrefSection } from './PreferencesView'

export function aiAssistantSection(): PrefSection {
  return {
    id: 'ai-assistant',
    label: 'AI Assistant',
    icon: <SmartToyIcon fontSize="small" />,
    items: [
      {
        id: 'ai-config',
        label: 'Configuration',
        keywords: 'ai assistant gemini claude openai openrouter api key token consent privacy model llm screenshot capture hotkey',
        content: <AiAssistantSetting />
      }
    ]
  }
}

const LINK = { color: '#00e6e6' }

function Select({ value, options, onChange, testid }: { value: string; options: readonly { id: string; label: string }[]; onChange: (v: string) => void; testid: string }): JSX.Element {
  return (
    <TextField select size="small" value={value} onChange={(e) => onChange(e.target.value)} slotProps={{ select: { native: true } }} fullWidth data-testid={testid}>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {opt.label}
        </option>
      ))}
    </TextField>
  )
}

const PROVIDER_OPTIONS = AI_PROVIDERS.map((p) => ({ id: p, label: AI_PROVIDER_INFO[p].label }))

/** OpenRouter keeps the adopted PR's eight pinned models; the others list what the key can use. */
function modelOptions(provider: AiProvider, live: readonly string[], current: string): { id: string; label: string }[] {
  if (provider === 'openrouter') return AI_MODEL_OPTIONS.map((o) => ({ id: o.id, label: o.label }))
  const ids = live.length > 0 ? live : [current]
  return (ids.includes(current) ? ids : [current, ...ids]).map((id) => ({ id, label: id }))
}

function useConfig(): [AiConfigView | null, () => void] {
  const [cfg, setCfg] = useState<AiConfigView | null>(null)
  const reload = useCallback(() => {
    void window.eq.getAiConfig().then(setCfg)
  }, [])
  useEffect(reload, [reload])
  return [cfg, reload]
}

function KeyField({ label, hasKey, value, onChange }: { label: string; hasKey: boolean; value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" fontWeight="bold">{label} API key</Typography>
      <TextField
        size="small"
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hasKey ? 'Saved - leave blank to keep it' : 'Paste your key'}
        fullWidth
        data-testid="ai-api-key-input"
      />
      <Typography variant="caption" color="text.secondary">Stored encrypted on this PC and sent only to {label}.</Typography>
    </Stack>
  )
}

function ModelField(props: { provider: AiProvider; model: string; live: readonly string[]; note: string; hasKey: boolean; onChange: (v: string) => void; onRefresh: () => void }): JSX.Element {
  const { provider, model, live, note, hasKey } = props
  const isOr = provider === 'openrouter'
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" fontWeight="bold">Model</Typography>
      <Select value={model} options={modelOptions(provider, live, model)} onChange={props.onChange} testid="ai-model-select" />
      <Typography variant="caption" color="text.secondary" component="div">
        {isOr
          ? '[Free] is $0 but rate-limited. [Good] is cheap paid, [Better] the daily driver, [Best] slowest and priciest.'
          : 'The list comes from your key, so a retired model is swapped for a current one when you save.'}
        {note ? ` ${note}` : ''}
        {!isOr && hasKey ? (
          <>
            {' '}
            <a href="#" style={LINK} onClick={(e) => { e.preventDefault(); props.onRefresh() }}>Refresh the list</a>
          </>
        ) : null}
      </Typography>
    </Stack>
  )
}

/** The trusted and classic-EQ lists for the assistant's web steps (shared/aiSources.ts). */
function SourcesField({ trusted, close, onTrusted, onClose }: { trusted: string; close: string; onTrusted: (v: string) => void; onClose: (v: string) => void }): JSX.Element {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" fontWeight="bold">Trusted sources</Typography>
      <Typography variant="caption" color="text.secondary">
        Questions are answered from the app&apos;s own wiki data first. Only when that has nothing does the
        assistant search these sites, and only after you say yes does it look anywhere else. One per
        line: a site, or a site with a path to trust just that part (reddit.com/r/EQLegends).
      </Typography>
      <TextField size="small" multiline minRows={3} value={trusted} onChange={(e) => onTrusted(e.target.value)} fullWidth data-testid="ai-trusted-sources" />
      <Typography variant="body2" fontWeight="bold" sx={{ pt: 1 }}>Classic EverQuest sources</Typography>
      <Typography variant="caption" color="text.secondary">
        Usually right for Legends, but drops, spawns and timers may differ. Their pages are tagged
        &quot;classic EQ&quot; when other sources are searched.
      </Typography>
      <TextField size="small" multiline minRows={1} value={close} onChange={(e) => onClose(e.target.value)} fullWidth data-testid="ai-close-sources" />
    </Stack>
  )
}

function StyleField({ value, onChange }: { value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" fontWeight="bold">Personal Style Instructions</Typography>
      <TextField
        size="small"
        multiline
        minRows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Always call me Boss. Keep your answers under 3 sentences."
        fullWidth
      />
      <Typography variant="caption" color="text.secondary">Extra rules appended to the system prompt.</Typography>
    </Stack>
  )
}

export function AiAssistantSetting(): JSX.Element {
  const [cfg, reload] = useConfig()
  const [provider, setProvider] = useState<AiProvider>('gemini')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [live, setLive] = useState<string[]>([])
  const [listNote, setListNote] = useState('')
  const [personalStyle, setPersonalStyle] = useState('')
  const [consent, setConsent] = useState(false)
  const [hotkey, setHotkey] = useState(true)
  const [trusted, setTrusted] = useState('')
  const [close, setClose] = useState('')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!cfg) return
    setProvider(cfg.provider)
    setModel(cfg.models[cfg.provider])
    setPersonalStyle(cfg.personalStyle ?? '')
    setConsent(cfg.consent)
    setHotkey(cfg.captureHotkey)
    setTrusted(cfg.trustedSources.join('\n'))
    setClose(cfg.closeSources.join('\n'))
  }, [cfg])

  /** Fetch the key's live models; resolves with the model to use (a retired one swapped out). */
  const loadModels = useCallback((p: AiProvider): Promise<string | null> => {
    if (p === 'openrouter') return Promise.resolve(null)
    setListNote('Loading models...')
    return window.eq.listAiModels(p).then((r) => {
      setLive(r.models)
      setModel(r.picked)
      setListNote(r.error ? `Could not load the model list: ${r.error}` : r.models.length ? '' : 'Save a key to load the model list.')
      return r.models.length ? r.picked : null
    })
  }, [])

  const pickProvider = (p: AiProvider): void => {
    setProvider(p)
    setApiKey('')
    setLive([])
    setListNote('')
    setModel(cfg?.models[p] ?? AI_PROVIDER_INFO[p].defaultModel)
    if (cfg?.hasKey[p]) void loadModels(p)
  }

  const hasKey = Boolean(cfg?.hasKey[provider])
  const handleSave = (): void => {
    if (!consent) return
    const base = { provider, apiKey: '', consent, personalStyle, captureHotkey: hotkey, trustedSources: parseSourceList(trusted), closeSources: parseSourceList(close) }
    setSaveError('')
    void window.eq
      .setAiConfig({ ...base, apiKey, model })
      .then(() => loadModels(provider))
      .then((picked) => (picked && picked !== model ? window.eq.setAiConfig({ ...base, model: picked }) : undefined))
      .then(() => {
        setApiKey('')
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        reload()
      })
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)))
  }

  const info = AI_PROVIDER_INFO[provider]
  return (
    <Stack spacing={3} data-testid="pref-ai-assistant">
      <Stack spacing={0.5}>
        <Typography variant="body2" fontWeight="bold">AI provider</Typography>
        <Select value={provider} options={PROVIDER_OPTIONS} onChange={(v) => pickProvider(v as AiProvider)} testid="ai-provider-select" />
        <Typography variant="caption" color="text.secondary">
          {info.keyHint} Get a key at{' '}
          <a href={info.keyUrl} target="_blank" rel="noreferrer" style={LINK}>
            {info.keyUrl.replace(/^https:\/\//, '')}
          </a>
          . Each provider keeps its own key and model, so you can switch back and forth.
        </Typography>
      </Stack>

      <KeyField label={info.label} hasKey={hasKey} value={apiKey} onChange={setApiKey} />
      <ModelField provider={provider} model={model} live={live} note={listNote} hasKey={hasKey} onChange={setModel} onRefresh={() => void loadModels(provider)} />

      <FormControlLabel
        control={<Switch size="small" checked={hotkey} onChange={(e) => setHotkey(e.target.checked)} data-testid="ai-hotkey-switch" />}
        label={<Typography variant="body2">Ctrl+Shift+A captures the screen while the AI overlay is open</Typography>}
      />

      <SourcesField trusted={trusted} close={close} onTrusted={setTrusted} onClose={setClose} />
      <StyleField value={personalStyle} onChange={setPersonalStyle} />

      <FormControlLabel
        control={<Checkbox size="small" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="ai-consent-checkbox" />}
        label={<Typography variant="body2">I understand recap lines, what I type and pictures I capture will be sent to {info.label}.</Typography>}
      />

      <Box>
        <Button variant="contained" disabled={!consent || (!apiKey && !hasKey)} onClick={handleSave} data-testid="ai-save-button">
          {saved ? 'Saved!' : 'Save Configuration'}
        </Button>
        {saveError ? <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }} data-testid="ai-save-error">{saveError}</Typography> : null}
      </Box>
    </Stack>
  )
}
