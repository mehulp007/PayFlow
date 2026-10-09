import { useState, type FormEvent } from 'react';
import { ArrowRight, BadgeCheck } from 'lucide-react';
import { DEDUCTION_LIMITS, HRA_CITIES, LANDLORD_PAN_RENT_LIMIT, type Declaration } from '@payflow/shared';
import { useFeedback } from '../../app/FeedbackProvider';
import { useDeclarationMutations } from '../../app/queries';
import { Pill } from '../../components';
import { dateTime, money } from '../../lib/format';

const OTHER_CITY = '__other';
const rupees = (paise: number | undefined) => (paise ? String(paise / 100) : '');
const paise = (value: string) => Math.round(Number(value || 0) * 100);

function MoneyField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={value}
        placeholder="0"
        onChange={event => onChange(event.target.value)}
      />
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

/**
 * The employee's declaration for the tax year (Form 124 under the Income-tax Rules, 2026). It is used for
 * TDS under the old regime; proofs are checked by HR, who marks the declaration verified.
 */
export function DeclarationForm({ employeeId, declaration }: { employeeId: string; declaration: Declaration | null }) {
  const { notify } = useFeedback();
  const { save } = useDeclarationMutations(employeeId);
  const knownCity = !declaration?.rentCity || HRA_CITIES.includes(declaration.rentCity);
  const [form, setForm] = useState({
    monthlyRent: rupees(declaration?.monthlyRent),
    city: knownCity ? (declaration?.rentCity ?? '') : OTHER_CITY,
    otherCity: knownCity ? '' : (declaration?.rentCity ?? ''),
    landlordPan: declaration?.landlordPan ?? '',
    landlordRelation: declaration?.landlordRelation ?? '',
    section123: rupees(declaration?.section123),
    npsAdditional: rupees(declaration?.npsAdditional),
    healthSelf: rupees(declaration?.healthSelf),
    healthParents: rupees(declaration?.healthParents),
    parentsSenior: declaration?.parentsSenior ?? false,
    homeLoanInterest: rupees(declaration?.homeLoanInterest),
  });
  const change = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));
  const rentsHome = paise(form.monthlyRent) > 0;
  const panNeeded = paise(form.monthlyRent) * 12 > LANDLORD_PAN_RENT_LIMIT;

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save.mutateAsync({
        monthlyRent: paise(form.monthlyRent),
        rentCity: rentsHome ? (form.city === OTHER_CITY ? form.otherCity : form.city) || null : null,
        landlordPan: rentsHome ? form.landlordPan || null : null,
        landlordRelation: rentsHome ? form.landlordRelation || null : null,
        section123: paise(form.section123),
        npsAdditional: paise(form.npsAdditional),
        healthSelf: paise(form.healthSelf),
        healthParents: paise(form.healthParents),
        parentsSenior: form.parentsSenior,
        homeLoanInterest: paise(form.homeLoanInterest),
      });
      notify('Declaration saved. HR will verify it against your proofs.');
    } catch {
      // Shown inline from the mutation state.
    }
  }

  return (
    <form className="hierarchy-form declaration-form" onSubmit={submit}>
      <div className="declaration-status">
        {declaration ? (
          <>
            <Pill tone={declaration.status === 'verified' ? 'success' : 'warning'}>
              {declaration.status === 'verified' ? 'Verified by HR' : 'Waiting for HR'}
            </Pill>
            <small>
              Submitted {dateTime(declaration.submittedAt)}
              {declaration.verifiedBy && ` · verified by ${declaration.verifiedBy}`}
            </small>
          </>
        ) : (
          <small>No declaration yet for this tax year.</small>
        )}
      </div>
      <h3>House rent</h3>
      <div className="hierarchy-form-grid">
        <MoneyField
          label="Rent paid · INR a month"
          value={form.monthlyRent}
          onChange={monthlyRent => change({ monthlyRent })}
        />
        <label>
          City of the rented home
          <select value={form.city} disabled={!rentsHome} onChange={event => change({ city: event.target.value })}>
            <option value="">Choose a city</option>
            {HRA_CITIES.map(city => (
              <option key={city} value={city}>
                {city} · 50% limit
              </option>
            ))}
            <option value={OTHER_CITY}>Another city · 40% limit</option>
          </select>
        </label>
      </div>
      {rentsHome && form.city === OTHER_CITY && (
        <label>
          City name
          <input value={form.otherCity} required onChange={event => change({ otherCity: event.target.value })} />
        </label>
      )}
      {rentsHome && (
        <div className="hierarchy-form-grid">
          <label>
            Landlord PAN {panNeeded ? '(required)' : '(optional)'}
            <input
              value={form.landlordPan}
              maxLength={10}
              required={panNeeded}
              placeholder="ABCDE1234F"
              onChange={event => change({ landlordPan: event.target.value.toUpperCase() })}
            />
          </label>
          <label>
            Relationship with the landlord
            <input
              value={form.landlordRelation}
              placeholder="None, or e.g. Father"
              onChange={event => change({ landlordRelation: event.target.value })}
            />
          </label>
        </div>
      )}
      <h3>Deductions · INR a year</h3>
      <div className="hierarchy-form-grid">
        <MoneyField
          label="Savings under s. 123"
          hint={`PPF, ELSS, life cover, tuition, home-loan principal. Employee PF counts too; limit ${money(DEDUCTION_LIMITS.section123)}.`}
          value={form.section123}
          onChange={section123 => change({ section123 })}
        />
        <MoneyField
          label="Additional NPS (s. 124)"
          hint={`Up to ${money(DEDUCTION_LIMITS.npsAdditional)} beyond s. 123.`}
          value={form.npsAdditional}
          onChange={npsAdditional => change({ npsAdditional })}
        />
      </div>
      <div className="hierarchy-form-grid">
        <MoneyField
          label="Health insurance: self and family"
          hint={`Up to ${money(DEDUCTION_LIMITS.healthSelf)} (${money(DEDUCTION_LIMITS.healthSelfSenior)} from age 60).`}
          value={form.healthSelf}
          onChange={healthSelf => change({ healthSelf })}
        />
        <MoneyField
          label="Health insurance: parents"
          hint={`Up to ${money(DEDUCTION_LIMITS.healthParents)}, or ${money(DEDUCTION_LIMITS.healthParentsSenior)} for senior parents.`}
          value={form.healthParents}
          onChange={healthParents => change({ healthParents })}
        />
      </div>
      <div className="hierarchy-checks">
        <label>
          <input
            type="checkbox"
            checked={form.parentsSenior}
            onChange={event => change({ parentsSenior: event.target.checked })}
          />{' '}
          A parent is 60 or older
        </label>
      </div>
      <MoneyField
        label="Home loan interest (self-occupied)"
        hint={`Up to ${money(DEDUCTION_LIMITS.homeLoanInterest)} a year.`}
        value={form.homeLoanInterest}
        onChange={homeLoanInterest => change({ homeLoanInterest })}
      />
      {save.error && <div className="message error">{save.error.message}</div>}
      <div className="info-strip">
        <BadgeCheck size={17} /> Declarations reduce TDS only under the old regime. Keep rent receipts and investment
        proofs for HR; the employer may correct TDS if proofs differ.
      </div>
      <div className="drawer-actions">
        <button className="button primary" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save declaration'} <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
