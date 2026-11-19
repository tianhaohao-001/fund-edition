import { registerRootComponent } from 'expo';
// Metro replaces this public build-time flag. Production never initializes fixture state.
const App = process.env.EXPO_PUBLIC_PREVIEW === '1'
  ? require('./preview').default
  : require('./App').default;
registerRootComponent(App);
