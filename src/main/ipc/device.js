import { ipcMain } from 'electron'
import deviceProbe from '../core/device-probe.js'
import * as store from '../core/store.js'

export function registerDeviceIpc() {
  // 获取已保存的设备报告（不重新检测）
  ipcMain.handle('device:report', () => store.getDeviceReport())

  // 执行兼容性检测（耗时操作，通过事件回报进度）
  ipcMain.handle('device:probe', async (event) => {
    const sender = event.sender
    try {
      const report = await deviceProbe.runProbe((stage, data) => {
        // 阶段进度上报到渲染端
        sender.send('device:probe:progress', { stage, ...data })
      })
      store.setDeviceReport(report)
      return { success: true, report }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}
