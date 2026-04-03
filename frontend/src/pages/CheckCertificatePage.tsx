import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  Loader2,
  Search,
  Upload,
} from "lucide-react";

import { judgeApi, type CertificateQueryItem } from "@/api/judge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type VerificationStatus = "idle" | "loading" | "found" | "not_found";

interface ParsedField {
  label: string;
  value: string;
}

const FIELD_LABELS = [
  "软件全称",
  "软件简称",
  "软件名称",
  "作品名称",
  "登记号",
  "分类号",
  "版本号",
  "著作权人",
  "权利人",
  "开发完成日期",
  "首次发表日期",
  "登记日期",
  "批准日期",
  "权利取得方式",
  "权利范围",
] as const;

function parseCertificateFields(text: string): ParsedField[] {
  const normalized = text.replace(/\r/g, "").trim();
  if (!normalized) {
    return [];
  }

  const segments = normalized
    .split(/\n+/)
    .flatMap((line) => line.split(/\s{2,}/))
    .map((segment) => segment.trim())
    .filter(Boolean);

  const parsed: ParsedField[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    const colonMatch = segment.match(/^([^:：]{1,20})[:：]\s*(.+)$/);
    if (colonMatch) {
      const label = colonMatch[1].trim();
      const value = colonMatch[2].trim();
      if (label && value) {
        const key = `${label}::${value}`;
        if (!seen.has(key)) {
          seen.add(key);
          parsed.push({ label, value });
        }
      }
      continue;
    }

    for (const label of FIELD_LABELS) {
      if (!segment.startsWith(label)) {
        continue;
      }

      const value = segment.slice(label.length).trim().replace(/^[:：]\s*/, "");
      if (!value) {
        continue;
      }

      const key = `${label}::${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        parsed.push({ label, value });
      }
      break;
    }
  }

  return parsed;
}

export function CheckCertificatePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [regNo, setRegNo] = useState("");
  const [owner, setOwner] = useState("");
  const [softName, setSoftName] = useState("");
  const [resultItems, setResultItems] = useState<CertificateQueryItem[]>([]);

  const handleVerify = async () => {
    if (!regNo) {
      alert("请填写登记号");
      return;
    }

    setStatus("loading");
    setResultItems([]);
    try {
      const response = await judgeApi.verifyCertificate(regNo, owner, softName);

      if (response.status === "found") {
        setResultItems(response.items);
        setStatus("found");
      } else {
        setResultItems([]);
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
    setResultItems([]);
    try {
      const response = await judgeApi.uploadAndVerifyCertificate(file);

      const nextRegNo = response.reg_no || "";
      const nextOwner = response.owner || "";
      const nextSoftName = response.soft_name || "";

      setRegNo(nextRegNo);
      setOwner(nextOwner);
      setSoftName(nextSoftName);

      if (nextRegNo) {
        const verifyResult = await judgeApi.verifyCertificate(
          nextRegNo,
          nextOwner,
          nextSoftName,
        );

        if (verifyResult.status === "found") {
          setResultItems(verifyResult.items);
          setStatus("found");
        } else {
          setStatus("not_found");
        }
      } else {
        setStatus("idle");
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
          从官方数据库抓取并展示该登记号对应的公开信息
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

      <p className="text-sm text-muted-foreground">
        可只填登记号直接查询；著作权人或软件名称会作为官方站内关键词辅助筛选。
      </p>

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
          {status === "found" && (
            <div className="space-y-4">
              <div className="p-6 rounded-xl border bg-green-50 border-green-200">
                <h3 className="text-green-800 font-bold text-lg">已获取官方查询结果</h3>
                <p className="text-green-700 text-sm">
                  以下内容为系统从官方公开页面抓取到的信息。
                </p>
              </div>

              {resultItems.map((item, index) => (
                (() => {
                  const parsedFields = parseCertificateFields(item.text);

                  return (
                    <Card key={`${item.title}-${index}`}>
                      <CardHeader>
                        <CardTitle className="text-base">
                          {item.title || `查询结果 ${index + 1}`}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {parsedFields.length > 0 && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {parsedFields.map((field, fieldIndex) => (
                              <div
                                key={`${field.label}-${fieldIndex}`}
                                className="rounded-lg border bg-muted/30 px-4 py-3"
                              >
                                <div className="text-xs text-muted-foreground">
                                  {field.label}
                                </div>
                                <div className="mt-1 break-all text-sm font-medium leading-6 text-foreground">
                                  {field.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="whitespace-pre-wrap break-all rounded-lg border border-dashed bg-background px-4 py-3 text-sm leading-6 text-foreground">
                          {item.text}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()
              ))}
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
        </div>
      )}
    </div>
  );
}

export default CheckCertificatePage;
