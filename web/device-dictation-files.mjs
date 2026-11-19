// The runtime and weights are immutable upstream releases. Sizes are decompressed HTTP body bytes.
export const assetPrefix='/api/device-assets/v1/';
const model='https://huggingface.co/Xenova/whisper-tiny/resolve/5332fcc35e32a33b86612b9a57a89be7906102b1/';
const npm='https://cdn.jsdelivr.net/npm/';
const files=[
  ['transformers.min.js',897938,'bcf7cf304e51f470ed59409622b9d6ffbad80dfcf5baf6a40c919e4b9c4ff812',npm+'@xenova/transformers@2.17.2/dist/transformers.min.js'],
  ['ort-wasm-simd.wasm',10014674,'9bd07bababc65f53d061f457233eeae501be7ceb8a2adb9eef52d87fe776d865',npm+'onnxruntime-web@1.14.0/dist/ort-wasm-simd.wasm'],
  ['model/config.json',2248,'2b2e4e519084e0ea028b19b153f95202735a971870d6844aa26e559edd292e94'],
  ['model/generation_config.json',3716,'68ac791fcb4999461a313472125042934656240ba1cba7d1c2627fcbb19ac24c'],
  ['model/preprocessor_config.json',339,'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'],
  ['model/tokenizer_config.json',282683,'2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce'],
  ['model/tokenizer.json',2480466,'27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566'],
  ['model/onnx/encoder_model_quantized.onnx',10124910,'fd9d995b9dcb0520f0dbf6cf68651af639fc385f594d9d876e69ca2802dc438e'],
  ['model/onnx/decoder_model_merged_quantized.onnx',30727765,'6c0c125986b007d2e3734bec84c18bda0152071b90b87fadac6d7764499927a0'],
];
export const deviceFiles=new Map(files.map(([name,size,sha256,url])=>[name,{
  size,sha256,url:url || model+name.slice('model/'.length),
  type:name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':name.endsWith('.json')?'application/json':'application/octet-stream'
}]));
export const deviceDictation={languages:['zh-CN','en-US'],downloadBytes:files.reduce((n,file)=>n+file[1],0)};
