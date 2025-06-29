from flask import Flask, render_template, Response, request
import cv2

app = Flask(__name__)

#camera = None  # глобально
# Захват с камеры (0 — первая камера)
camera = cv2.VideoCapture(0)

isVideo = True


def gen_frames():
    global camera
    while True:
        success, frame = camera.read()
        if not success:
            break
        else:
            # Преобразуем кадр в JPEG
            ret, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()
            # Возвращаем поток в формате MJPEG
            yield (b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')


@app.route('/start', methods=['POST'])
def start():
    global isVideo
    isVideo = True
    print('started')
    return 'started'
    #do not run
    global camera
    if camera is None:
        camera = cv2.VideoCapture(0)
    return 'started'


@app.route('/stop', methods=['POST'])
def stop():
    global isVideo
    isVideo = False
    print('stopped')
    return 'stopped'
    #do not run
    global camera
    if camera:
        camera.release()
        camera = None
    return 'stopped'




@app.route('/')
def index():
    return render_template('index.html')  # HTML страница с видео


@app.route('/video_feed')

def video_feed():
    global isVideo
    if isVideo:
        return Response(gen_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')
    else:
        return Response(None, mimetype='multipart/x-mixed-replace; boundary=frame')






if __name__ == '__main__':
    #app.run(debug=True)
    app.run(host='0.0.0.0', port=5000, debug=True)