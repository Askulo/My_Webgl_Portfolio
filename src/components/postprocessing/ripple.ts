import * as THREE from 'three'

export class RippleRenderer {
  private _scene: THREE.Scene
  private _target: THREE.WebGLRenderTarget
  private _camera: THREE.OrthographicCamera
  private _meshs: THREE.Mesh[] = []
  /** Maximum number of simultaneous ripple stamps */
  private _max: number
  /** Minimum mouse-travel distance per frame before stamping */
  private _frequency = 5
  private _mouse     = new THREE.Vector2(0, 0)
  private _prevMouse = new THREE.Vector2(0, 0)
  private _currentWave = 0

  constructor(private _texture: THREE.Texture, max = 100) {
    this._max = max

    this._scene  = new THREE.Scene()
    this._target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight)

    const { width, height, near, far } = this._cameraProps()
    this._camera = new THREE.OrthographicCamera(-width, width, height, -height, near, far)
    this._camera.position.set(0, 0, 2)

    this._createMesh()

    window.addEventListener('mousemove', this._handleMouseMove)
    window.addEventListener('resize',    this._handleResize)
  }

  private _cameraProps = () => {
    const frustumSize = window.innerHeight
    const aspect = window.innerWidth / window.innerHeight
    return {
      width:  (frustumSize * aspect) / 2,
      height: frustumSize / 2,
      near:   -1000,
      far:    1000,
    }
  }

  private _createMesh = () => {
    const size     = 64
    const geometry = new THREE.PlaneGeometry(size, size)
    const material = new THREE.MeshBasicMaterial({
      map:         this._texture,
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthTest:   false,
      depthWrite:  false,
    })
    for (let i = 0; i < this._max; i++) {
      const mesh = new THREE.Mesh(geometry.clone(), material.clone())
      mesh.rotateZ(2 * Math.PI * Math.random())
      mesh.visible = false
      this._scene.add(mesh)
      this._meshs.push(mesh)
    }
  }

  private _handleMouseMove = (e: MouseEvent) => {
    this._mouse.x =  e.clientX - window.innerWidth  / 2
    this._mouse.y = -e.clientY + window.innerHeight / 2
  }

  private _handleResize = () => {
    const { width, height } = this._cameraProps()
    this._camera.left   = -width
    this._camera.right  =  width
    this._camera.top    =  height
    this._camera.bottom = -height
    this._camera.updateProjectionMatrix()
    this._target.setSize(window.innerWidth, window.innerHeight)
  }

  private _setNewWave = () => {
    const mesh = this._meshs[this._currentWave]
    mesh.visible = true
    mesh.position.set(this._mouse.x, this._mouse.y, 0)
    mesh.scale.x = mesh.scale.y = 0.2;
    (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5
  }

  private _trackMousePos = () => {
    if (this._frequency < this._mouse.distanceTo(this._prevMouse)) {
      this._setNewWave()
      this._currentWave = (this._currentWave + 1) % this._max
    }
    this._prevMouse.copy(this._mouse)
  }

  /**
   * Call once per frame from useFrame.
   * Renders the ripple scene into the off-screen target and
   * writes the resulting texture into `uTexture`.
   */
  update = (gl: THREE.WebGLRenderer, uTexture: THREE.IUniform<any>) => {
    this._trackMousePos()

    gl.setRenderTarget(this._target)
    gl.render(this._scene, this._camera)
    uTexture.value = this._target.texture
    gl.setRenderTarget(null)

    this._meshs.forEach((mesh) => {
      if (!mesh.visible) return
      const mat = mesh.material as THREE.MeshBasicMaterial
      mesh.rotation.z  += 0.02
      mat.opacity       *= 0.97
      mesh.scale.x       = 0.98 * mesh.scale.x + 0.17
      mesh.scale.y       = mesh.scale.x
      if (mat.opacity < 0.002) mesh.visible = false
    })
  }

  dispose = () => {
    window.removeEventListener('mousemove', this._handleMouseMove)
    window.removeEventListener('resize',    this._handleResize)
    this._target.dispose()
    this._meshs.forEach((m) => {
      m.geometry.dispose();
      (m.material as THREE.MeshBasicMaterial).dispose()
    })
  }
}
