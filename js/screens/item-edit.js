
import { html, useState } from '../../vendor/preact-htm.js';
import {
  Page, Button, Field, TextInput, NumberInput, Select, Segmented, Toggle, Card, Empty, Loader, toast,
} from '../ui/bits.js';
import { Icon } from '../ui/icons.js';
import { useData } from '../ui/hooks.js';
import { back } from '../router.js';
import { getStore } from '../data/store.js';
import { fmtDuration, timeOptions } from '../lib/time.js';

const COLORS = ['#8FB8E8', '#7FCB7A', '#BFEBC3', '#EE8ACF', '#F0705A', '#8ED6D0', '#D58BE0', '#F4D94E', '#DDE9A8', '#2E9E5B', '#3D5BF0', '#56606B'];
const PRODUCT_COLOR = '#C9BBA6';
const KINDS = [{ value: 'treatment', label: 'טיפול' }, { value: 'product', label: 'מוצר' }, { value: 'series', label: 'סדרה' }];

function ItemForm({ item, categories }) {
  const isNew = !item;
  const [name, setName] = useState(item ? item.name : '');
  const [shortName, setShortName] = useState(item ? item.shortName || '' : '');
  const [kind, setKind] = useState(item ? item.kind : 'treatment');
  const [category, setCategory] = useState(item ? item.category : categories[0] || '');
  const [price, setPrice] = useState(item ? item.price : null);
  const [dur, setDur] = useState(item && item.durationMin > 0 ? item.durationMin : 60);
  const [color, setColor] = useState(item ? item.color : COLORS[0]);
  const [active, setActive] = useState(item ? !!item.active : true);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);

  const cats = categories.includes(category) || !category ? categories : [...categories, category];
  const colors = COLORS.includes(color) ? COLORS : [color, ...COLORS.slice(0, 11)];
  const durOptions = timeOptions(15, 301, 15);
  if (!durOptions.includes(dur)) durOptions.push(dur);
  durOptions.sort((a, b) => a - b);

  const save = async () => {
    if (busy) return;
    const e = {};
    if (!name.trim()) e.name = 'חסר שם לפריט';
    if (price == null) e.price = 'חסר מחיר';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await getStore().saveService({
        ...(item || {}),
        name: name.trim(),
        shortName: shortName.trim() || name.trim(),
        kind,
        category,
        price,
        durationMin: kind === 'product' ? 0 : dur,
        color: kind === 'product' ? (item ? item.color : PRODUCT_COLOR) : color,
        active,
      });
      toast('נשמר');
      back('/items');
    } catch (ex) {
      setErr({ name: ex && ex.message ? ex.message : 'השמירה נכשלה' });
      setBusy(false);
    }
  };

  const footer = html`<${Button} type="submit" disabled=${busy}>שמירה</${Button}>`;

  return html`<${Page} title=${isNew ? 'פריט' : 'עריכת'} em=${isNew ? 'חדש' : 'פריט'} back backTo="/items"
    onSubmit=${save} footer=${footer}>
    <${Field} label="שם" error=${err.name}>
      <${TextInput} value=${name} onChange=${setName} autocomplete="off" />
    </${Field}>
    <${Field} label="שם קצר ליומן" hint="מה שרואים במשבצת של היומן">
      <${TextInput} value=${shortName} onChange=${setShortName} autocomplete="off" />
    </${Field}>
    <${Field} label="סוג">
      <${Segmented} options=${KINDS} value=${kind} onChange=${(v) => { setKind(v); }} />
    </${Field}>
    <${Field} label="קטגוריה">
      <${Select} value=${category} onChange=${setCategory} options=${cats.map((c) => ({ value: c, label: c }))} />
    </${Field}>
    <${Field} label="מחיר" error=${err.price}>
      <${NumberInput} value=${price} onChange=${setPrice} suffix="₪" />
    </${Field}>
    ${kind !== 'product' && html`<${Field} label="משך">
      <${Select} value=${dur} onChange=${setDur} options=${durOptions.map((m) => ({ value: m, label: fmtDuration(m) }))} />
    </${Field}>`}
    ${kind !== 'product' && html`<${Field} label="צבע">
      <div class="swatches" role="group" aria-label="צבע">
        ${colors.map((c, i) => html`<button type="button" key=${c} class=${'swatch' + (c === color ? ' is-active' : '')}
          aria-label=${'צבע ' + (i + 1)} aria-pressed=${c === color ? 'true' : 'false'} onClick=${() => setColor(c)}>
          <span class="swatch-fill" style=${{ background: c }} />
          ${c === color && html`<${Icon} name="check" size=${20} />`}
        </button>`)}
      </div>
    </${Field}>`}
    <${Card}>
      <${Toggle} label="פעיל" checked=${active} onChange=${setActive} />
    </${Card}>
  </${Page}>`;
}

export default function ItemEdit({ params }) {
  const id = params && params.id;
  const { data, loading } = useData(async (s) => ({
    item: id ? await s.getService(id) : null,
    settings: await s.getSettings(),
  }), [id]);

  if (!data) {
    return html`<${Page} title=${id ? 'עריכת' : 'פריט'} em=${id ? 'פריט' : 'חדש'} back backTo="/items">${loading && html`<${Loader} />`}</${Page}>`;
  }
  if (id && !data.item) {
    return html`<${Page} title="עריכת" em="פריט" back backTo="/items">
      <${Empty} text="הפריט לא נמצא" />
      <${Button} kind="soft" href="/items">חזרה לפריטים</${Button}>
    </${Page}>`;
  }
  return html`<${ItemForm} key=${id || 'new'} item=${data.item} categories=${data.settings.categories || []} />`;
}
