import type { FormFieldProps } from './types';
export default function FormField(props: FormFieldProps) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={props.id}>
        {props.label}
      </label>
      {props.multiline ? (
        <textarea
          className="form-textarea"
          id={props.id}
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
        />
      ) : (
        <input
          className="form-input"
          id={props.id}
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </div>
  );
}
