import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Search,
  Upload,
  XCircle,
} from "lucide-react";

import { judgeApi } from "@/api/judge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type VerificationStatus =
  | "idle"
  | "loading"
  | "success"
  | "not_found"
  | "mismatch";

export function CheckCertificatePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [regNo, setRegNo] = useState("");
  const [owner, setOwner] = useState("");
  const [softName, setSoftName] = useState("");

  const handleVerify = async () => {
    if (!regNo || (!owner && !softName)) {
      alert("请填写登记号，并至少填写著作权人或软件名称中的一项");
      return;
    }

    setStatus("loading");
    try {
      const response = await judgeApi.verifyCertificate(regNo, owner, softName);

      if (response.status === "success") {
        setStatus("success");
      } else if (response.status === "not_found") {
        setStatus("not_found");
      } else if (response.status === "mismatch") {
        setStatus("mismatch");
      } else {
        setStatus("not_found");
      }
    } catch (error) {
      console.error("验证失败:", error);
      alert("验证失败，请稍后重试");
      setStatus("idle");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("loading");
    try {
      const response = await judgeApi.uploadAndVerifyCertificate(file);

      if (response.status === "success") {
        setRegNo(response.reg_no || "");
        setOwner(response.owner || "");
        setSoftName(response.soft_name || "");
        setStatus("success");
      } else if (response.status === "not_found") {
        setStatus("not_found");
      } else if (response.status === "mismatch") {
        setStatus("mismatch");
      } else {
        setStatus("not_found");
      }
    } catch (error) {
      console.error("文件验证失败:", error);
      alert("文件验证失败，请稍后重试");
      setStatus("idle");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 px-4">
      <Button variant="ghost" onClick={() => navigate("/")} className="group">
        <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
        返回首页
      </Button>

      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">证书真伪核验</h1>
        <p className="text-muted-foreground">
          通过官方数据库实时核对软件著作权登记证书的真实性
        </p>
        <div className="flex justify-center">
          <Badge variant="secondary" className="px-3 py-1 text-sm">
            验证码由模型自动处理，联网核验通常需要 1 到 5 分钟
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4" /> 快速上传识别
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() =>
                (
                  document.querySelector(
                    'input[type="file"]',
                  ) as HTMLInputElement | null
                )?.click()
              }
            >
              <FileText className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-xs text-center text-muted-foreground">
                点击上传扫描件、PDF
                <br />
                自动提取登记号信息
              </p>
              <input
                type="file"
                className="hidden"
                onChange={handleFileUpload}
                accept=".pdf,.jpg,.jpeg,.png"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" /> 手动录入信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="regNo">
                登记号 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="regNo"
                placeholder="如: 2024SR012345"
                value={regNo}
                onChange={(event) => setRegNo(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner">著作权人</Label>
              <Input
                id="owner"
                placeholder="公司或个人名称"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="softName">软件名称</Label>
              <Input
                id="softName"
                placeholder="全称或简称"
                value={softName}
                onChange={(event) => setSoftName(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Button
        className="w-full h-12 text-lg"
        onClick={handleVerify}
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <>
            <Loader2 className="mr-2 animate-spin" />
            联网核验中，请勿关闭页面
          </>
        ) : (
          "开始联网核验"
        )}
      </Button>

      {status !== "idle" && status !== "loading" && (
        <div className="animate-in zoom-in-95 duration-300">
          {status === "success" && (
            <div className="p-6 rounded-xl border bg-green-50 border-green-200 flex items-start gap-4">
              <CheckCircle2 className="h-8 w-8 text-green-600 mt-1" />
              <div>
                <h3 className="text-green-800 font-bold text-lg">校验通过</h3>
                <p className="text-green-700 text-sm">
                  该证书信息与中国版权保护中心登记数据完全一致。
                </p>
              </div>
            </div>
          )}

          {status === "not_found" && (
            <div className="p-6 rounded-xl border bg-amber-50 border-amber-200 flex items-start gap-4">
              <AlertTriangle className="h-8 w-8 text-amber-600 mt-1" />
              <div>
                <h3 className="text-amber-800 font-bold text-lg">
                  未查询到相关信息
                </h3>
                <p className="text-amber-700 text-sm">
                  官方数据库中暂无此登记号记录，请核对输入是否有误或证书是否刚签发。
                </p>
              </div>
            </div>
          )}

          {status === "mismatch" && (
            <div className="p-6 rounded-xl border bg-red-50 border-red-200 flex items-start gap-4">
              <XCircle className="h-8 w-8 text-red-600 mt-1" />
              <div>
                <h3 className="text-red-800 font-bold text-lg">信息不匹配</h3>
                <p className="text-red-700 text-sm">
                  系统发现登记号对应的官方著作权人或软件名称与您提供的信息不符，请警惕虚假证书。
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CheckCertificatePage;
