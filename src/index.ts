import type { App } from 'vue'
import './styles/tokens.css'
import './styles/components.css'
import { createSelfHostedAdapter } from './adapters/selfHosted'
import ActiveLearningPanel from './components/ActiveLearningPanel.vue'
import AnnotationWorkspace from './components/AnnotationWorkspace.vue'
import DatasetEda from './components/DatasetEda.vue'
import DatasetManager from './components/DatasetManager.vue'
import ModelCreateWizard from './components/ModelCreateWizard.vue'
import ModelDetail from './components/ModelDetail.vue'
import ModelList from './components/ModelList.vue'
import ModelQuestionTree from './components/ModelQuestionTree.vue'
import ParameterPerformanceExplorer from './components/ParameterPerformanceExplorer.vue'
import ConfusionMatrix from './components/shared/ConfusionMatrix.vue'
import ModelLens from './components/shared/ModelLens.vue'
import PlotlyChart from './components/shared/PlotlyChart.vue'
import ThemeSwitcher from './components/shared/ThemeSwitcher.vue'
import TrainingCurves from './components/TrainingCurves.vue'
import TrainingMonitor from './components/TrainingMonitor.vue'
import { MlBuilderThemeProvider, applyTheme, clearTheme, createTheme, ensurePresetStyles } from './theme'
import type { MlBuilderTheme, ThemeConfig, ThemeOverrides, ThemePreset, ThemeToken } from './theme'
import type { MLAdapter, MLBuilderPluginOptions } from './types'

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

function resolveAdapter(opts: MLBuilderPluginOptions): MLAdapter {
  if ('listDatasets' in opts.adapter) return opts.adapter
  return createSelfHostedAdapter(opts.adapter)
}

/** Vue plugin — registers all components globally and provides the adapter
 * (mirrors vue-legal-summarizer's VueLegalSummarizerPlugin). Components also
 * accept an explicit `adapter` prop for non-plugin, directly-imported usage. */
export const VueLegalMlBuilderPlugin = {
  install(app: App, opts: MLBuilderPluginOptions) {
    const adapter = resolveAdapter(opts)
    app.provide('vmlb:adapter', adapter)
    app.provide('vmlb:pollInterval', opts.pollInterval ?? 3000)
    app.provide('vmlb:hideAnnotation', opts.hideAnnotation ?? false)
    if (opts.theme && typeof document !== 'undefined') {
      applyTheme(opts.themeTarget ?? document.documentElement, opts.theme)
    }
    app.component('MlBuilderThemeProvider', MlBuilderThemeProvider)
    app.component('DatasetManager', DatasetManager)
    app.component('DatasetEda', DatasetEda)
    app.component('ModelList', ModelList)
    app.component('ModelCreateWizard', ModelCreateWizard)
    app.component('ModelDetail', ModelDetail)
    app.component('ModelQuestionTree', ModelQuestionTree)
    app.component('TrainingMonitor', TrainingMonitor)
    app.component('TrainingCurves', TrainingCurves)
    app.component('ParameterPerformanceExplorer', ParameterPerformanceExplorer)
    app.component('AnnotationWorkspace', AnnotationWorkspace)
    app.component('ActiveLearningPanel', ActiveLearningPanel)
    app.component('ConfusionMatrix', ConfusionMatrix)
    app.component('ModelLens', ModelLens)
    app.component('PlotlyChart', PlotlyChart)
    app.component('ThemeSwitcher', ThemeSwitcher)
  },
}

export default VueLegalMlBuilderPlugin

// ---------------------------------------------------------------------------
// Named exports for direct (non-plugin) usage
// ---------------------------------------------------------------------------

export {
  ActiveLearningPanel,
  AnnotationWorkspace,
  ConfusionMatrix,
  DatasetEda,
  DatasetManager,
  MlBuilderThemeProvider,
  ModelCreateWizard,
  ModelDetail,
  ModelLens,
  ModelList,
  ModelQuestionTree,
  ParameterPerformanceExplorer,
  PlotlyChart,
  ThemeSwitcher,
  TrainingCurves,
  TrainingMonitor,
}

export { applyTheme, clearTheme, createTheme, ensurePresetStyles, themeTokens } from './theme'
export { PRESET_TOKENS, THEME_IDS, THEME_PRESETS, isThemeId, presetMeta } from './theme'
export type { MlBuilderTheme, ThemeConfig, ThemeOverrides, ThemePreset, ThemeToken } from './theme'
export type { ThemeId, ThemeMode, ThemePresetMeta } from './theme'

export { createSelfHostedAdapter } from './adapters/selfHosted'
export type { SelfHostedAdapterOptions } from './adapters/selfHosted'

export { mountComponent } from './mount'
export type { MountedComponent } from './mount'

export { useActiveLearning } from './composables/useActiveLearning'
export { useAnnotation } from './composables/useAnnotation'
export { useDatasets } from './composables/useDatasets'
export { useEda } from './composables/useEda'
export { useModels } from './composables/useModels'
export { useParameterComparison } from './composables/useParameterComparison'
export { useTraining } from './composables/useTraining'
export { useTrainingCurves } from './composables/useTrainingCurves'

export { allModelInfo, modelsByTaskType, parameterRules, parameterSchemas, quickGuideFor, taskTypeLabel } from './components/modelCatalogData'
export { classColor, defaultLabels, lensCopy, lensFamily } from './lens/modelLens'
export type { LensCopy, LensFamily, LensPoint } from './lens/modelLens'
export { decisionTreeFor } from './lens/modelGuide'
export { ANNOTATION_STATE, annotationControls, annotationState, canSaveAnnotation, labelledRows, nothingToAnnotateReason } from './annotation/annotationState'
export type { AnnotationControls, AnnotationScreenState, EntitySpan } from './annotation/annotationState'
export { STRATEGY_COPY, holdoutClassText, retrainPrompt, trainingWarning, verificationText } from './annotation/activeLearning'
export type { DecisionTree, GuideNode, GuideOption } from './lens/modelGuide'

export type {
  ActiveLearningRound,
  ActiveLearningSettings,
  ActiveLearningStartOptions,
  ActiveLearningState,
  AnnotationStats,
  AnnotationTask,
  Dataset,
  DatasetUploadMeta,
  EdaResult,
  ExplanationResult,
  Id,
  MLAdapter,
  MLBuilderPluginOptions,
  MlModel,
  ModelCatalog,
  ParameterRule,
  ModelComparison,
  ModelStatus,
  ModelTypeInfo,
  ParameterComparisonPoint,
  ParameterFieldSchema,
  ParameterFieldType,
  PredictionResult,
  TrainingJob,
  TrainingJobStatus,
  TrainingMetricPoint,
} from './types'
