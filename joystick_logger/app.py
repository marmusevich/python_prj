from flask import Flask, request, render_template
import datetime

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/log_button", methods=["POST"])
def log_button():
    data = request.get_json()
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    if "button" in data and "state" in data:
        print(f"[{timestamp}] Button {data['button']} is {data['state']}")
    elif "axes" in data:
        #values = ', '.join(f"{v:.2f}" for v in data["axes"])
        values = ', '.join(f"axis[{i}]={v:.2f}" for i, v in enumerate(data["axes"]))
        print(f"[{timestamp}] Axes: {values}")

    return {"status": "ok"}

if __name__ == "__main__":
    app.run(debug=True)