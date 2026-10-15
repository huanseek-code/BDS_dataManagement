const crypto = require("crypto");

async function simulate() {
  const webhookUrl = "http://localhost:3000/api/zalo/webhook";
  const appId = "2582403571303679004";
  const oaSecret = process.env.ZALO_OA_SECRET_KEY || "";

  const payload = {
    app_id: appId,
    user_id_by_app: "zalo_test_partner_001",
    event_name: "user_send_text",
    timestamp: String(Date.now()),
    sender: {
      id: "zalo_user_998877",
      name: "Anh Minh (Môi giới Thủ Đức)"
    },
    message: {
      msg_id: "msg_sim_" + Date.now(),
      text: "Gửi bên anh xưởng 2.800m2 đường số 4, KCN Linh Trung 2, Thủ Đức. PCCC tự động nghiệm thu, trạm điện 400kVA, đường cont 40ft. Giá 4.8$/m2/tháng. Hoa hồng 1 tháng bên anh nhận 50% nhé."
    }
  };

  const rawBody = JSON.stringify(payload);
  const signature = "mac=" + crypto.createHash("sha256").update(appId + rawBody + payload.timestamp + oaSecret).digest("hex");

  console.log("Bắn sự kiện giả lập Zalo tới webhook...");
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-zevent-timestamp": payload.timestamp,
      "x-zevent-signature": signature
    },
    body: rawBody
  });

  const json = await res.json();
  console.log("Webhook phản hồi:", json);
}

simulate().catch(console.error);
