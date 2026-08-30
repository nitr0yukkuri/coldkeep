declare module 'react-native-vector-icons/Ionicons' {
  import type { ComponentType } from 'react';
  import type { TextProps } from 'react-native';

  type IoniconsProps = TextProps & {
    name: string;
    size?: number;
    color?: string;
  };

  const Ionicons: ComponentType<IoniconsProps>;
  export default Ionicons;
}
