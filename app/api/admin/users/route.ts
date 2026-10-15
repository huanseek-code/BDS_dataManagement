import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/app/auth/actions";

// GET: Lấy danh sách thành viên
export async function GET() {
  try {
    const currentProfile = await getCurrentUserProfile();
    if (!currentProfile || currentProfile.role !== "admin") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền truy cập" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: users, error } = await admin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Tạo tài khoản nhân viên mới
export async function POST(req: NextRequest) {
  try {
    const currentProfile = await getCurrentUserProfile();
    if (!currentProfile || currentProfile.role !== "admin") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền tạo nhân viên" }, { status: 403 });
    }

    const { email, password, fullName, role = "staff" } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: "Vui lòng điền đầy đủ Email, Mật khẩu và Họ tên" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Mật khẩu phải từ 6 ký tự trở lên" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Tạo user trong auth.users
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
      },
    });

    if (authError) {
      console.error("Auth createUser error:", authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, user: authData.user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH: Khóa / Mở khóa tài khoản hoặc đổi vai trò
export async function PATCH(req: NextRequest) {
  try {
    const currentProfile = await getCurrentUserProfile();
    if (!currentProfile || currentProfile.role !== "admin") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền sửa trạng thái" }, { status: 403 });
    }

    const { id, isActive, role } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Thiếu ID người dùng" }, { status: 400 });
    }

    if (id === currentProfile.id && isActive === false) {
      return NextResponse.json({ error: "Bạn không thể tự khóa tài khoản của chính mình" }, { status: 400 });
    }

    const admin = createAdminClient();
    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (typeof isActive === "boolean") updatePayload.is_active = isActive;
    if (role) updatePayload.role = role;

    const { error } = await admin
      .from("profiles")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Xóa vĩnh viễn tài khoản
export async function DELETE(req: NextRequest) {
  try {
    const currentProfile = await getCurrentUserProfile();
    if (!currentProfile || currentProfile.role !== "admin") {
      return NextResponse.json({ error: "Chỉ Admin mới có quyền xóa tài khoản" }, { status: 403 });
    }

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Thiếu ID người dùng" }, { status: 400 });
    }

    if (id === currentProfile.id) {
      return NextResponse.json({ error: "Bạn không thể tự xóa tài khoản của chính mình" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Xóa trong auth.users (cascade sang profiles)
    const { error: authError } = await admin.auth.admin.deleteUser(id);
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
