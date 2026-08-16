// Punto de entrada de Expo. `registerRootComponent` equivale a AppRegistry.registerComponent y
// además prepara el entorno tanto en el dev client como en la build nativa.
import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
