import { Input, Text, Textarea, View } from '@tarojs/components';
import type { FormFieldProps } from './types';
export default function FormField(props: FormFieldProps) {
  return (
    <View className="form-field">
      <Text className="form-label">{props.label}</Text>
      {props.multiline ? (
        <Textarea
          className="form-textarea"
          id={props.id}
          ariaLabel={props.label}
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          maxlength={-1}
          onInput={(event) => props.onChange(event.detail.value)}
        />
      ) : (
        <Input
          className="form-input"
          id={props.id}
          ariaLabel={props.label}
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          maxlength={-1}
          onInput={(event) => props.onChange(event.detail.value)}
        />
      )}
    </View>
  );
}
